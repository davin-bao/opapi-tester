import axios from 'axios'
import {addMsg} from 'jest-html-reporters/helper'
import token from './token.js'

const instance = axios.create({
    timeout: 60000,
    headers: {'X-Custom-Header': 'foobar'}
})

instance.defaults.headers.common['Authorization'] = 'Bearer ' + token


// 执行测试，捕获异常
const execute = async (callback) => {
    try {
        await callback()
    } catch (e) {
        if (e instanceof axios.AxiosError) {
        if (e.response) {
            await addMsg({ message: 'RES STATUS:' + e.response.status || 'undefined' })
            await addMsg({ message: 'RES DATA:' + JSON.stringify(e.response.data || {}, null, 2) })
        } else {
            await addMsg({ message: 'RES CODE:' + e.code || 'unknown' })
            await addMsg({ message: 'RES ERR:' + JSON.stringify(e.errors || {}, null, 2) })
        }
        }
        expect(0).toBe(200)
    }
}

export { instance, execute }