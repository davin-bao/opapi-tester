import { program } from "commander"
import fs from 'fs'
import path from 'path'
import moment from 'moment'
import SwaggerParser from '@apidevtools/swagger-parser'

function getRequestBody (operation, $refs) {
    // 安全的获取对象属性链
    function getValue(obj, ...pathParts) {
        let current = obj;
        for (const part of pathParts) {
          current = current?.[part];
          if (current === undefined) return undefined;
        }
        return current;
    }      
    // 生成Body
    let body = {}
    for (var type of ['application/json', '*/*']) {
        let requestBodyRef = getValue(operation, 'requestBody','content', type, 'schema', '$ref') || false
        if(requestBodyRef) {
            return $refs.get(requestBodyRef)?.example || {}
        }
        
        requestBodyRef = getValue(operation, 'requestBody','content', type, 'schema', 'items', '$ref') || false
        if(requestBodyRef) {
            return [$refs.get(requestBodyRef)?.example] || []
        }
        
        body = getValue(operation, 'requestBody','content', type, 'schema', 'example')
        if (body) {
            return body
        }
    }
    return body || {}
}

async function generate(input, targetPath) {
    const api = await SwaggerParser.parse(input)
    let $refs = await SwaggerParser.resolve(input)
    let filename = path.basename(input)
    filename = filename.substring(0, filename.lastIndexOf('.'))
    if (targetPath) {
        filename += targetPath.replaceAll('\\', '-').replaceAll('/', '-')
    }

    // 获取BaseUrl
    let key = '/api'
    let url = api.servers[0]?.url || key
    let baseUrl = url.substr(0, url.indexOf(key) + key.length)
    let basePath = url.substr(url.indexOf(key) + key.length)  

    const testCases = Object.entries(api.paths).flatMap(([path, pathObj]) => {
        if (targetPath) {
            if (path != targetPath) return ''
        }
        path = basePath + path
        return Object.entries(pathObj).map(([method, operation]) => {
            const inputParams = operation.parameters || []
            
            // 生成请求地址
            let apiPath = path
            for (var param of inputParams) {
                if (param.in == 'path') {
                    apiPath = apiPath.replaceAll(`{${param.name}}`, param.example)
                }
            }
            // 生成Query
            let query = {}
            for (var param of inputParams) {
                if (param.in == 'query') {
                    query[param.name] = param.example
                }
            }
            // 生成Body
            let body = getRequestBody(operation, $refs)
            
            // 生成验证的 Response
            let expects = ''
            const responseVal = Object.values(operation?.responses || {})
            const responseSchema = responseVal[0]?.content?.['application/json']?.schema
            if (responseSchema?.type == 'array') {
                let ref = responseSchema?.items?.['$ref']
                if (ref) {
                    const arrResponseRefs = $refs.get(responseSchema?.items?.['$ref'])
                    const arrFirstProperty = Object.keys(arrResponseRefs?.properties || {})?.[0]
                    expects = `expect(res).toHaveProperty('data[0].${arrFirstProperty}')`
                } else {
                    expects = `expect(Array.isArray(result)).toBe(true);`
                }
            } else {
                const ref = responseSchema?.['$ref']
                if (ref) {
                    const responseRef = $refs.get(ref)
                    const firstProperty = Object.keys(responseRef?.properties || {})?.[0]
                    expects = `if (res.data == '') expect(res.data).toBe('')
                    else expect(res.data).toHaveProperty('${firstProperty}')`
                }
            }

            // 根据实际需要构建 Jest 测试用例字符串
            return `
    test('${method.toUpperCase()} ${path}', async () => {
        await execute(async () => {
            const query = ${JSON.stringify(query, null, 2)}
            const body = ${JSON.stringify(body, null, 2)}
            await addMsg({ message: 'PATH:${apiPath}' })
            await addMsg({ message: 'QUERY: ' + JSON.stringify(query, null, 2) })
            await addMsg({ message: 'BODY: ' + JSON.stringify(body, null, 2) })
            const res = await axios.request({
                url: '${apiPath}',
                method: '${method.toLowerCase()}',
                params: query,
                data: body
            })
            await addMsg({ message: 'RES STATUS:' + res.status })
            await addMsg({ message: 'RES:' + JSON.stringify(res.data, null, 2) })
            expect(res.status).toBe(200)
            ${expects}
        })
    })`
        })
    }).filter(c => c != '')
    
    const template = `
import { instance as axios, execute } from '../libs/axios.js'
import {addMsg} from 'jest-html-reporters/helper'
axios.defaults.baseURL = '${baseUrl}'

describe('${filename.toUpperCase()} Tests', () => {
    ${testCases.join('\n')}
})
`
    // 将测试用例写入到一个 Jest 测试文件中
    let formattedDate = moment(new Date()).format('YYMMDDHHmm')
    fs.writeFileSync(`./src/_tests/${filename}-${formattedDate}.test.js`, template)
}

program
    .version(process.env.npm_package_version || "unknown")
    .arguments("<source> [path]")
    .action((src, path) => {
        generate(src, path)
    })
program.parse(process.argv)