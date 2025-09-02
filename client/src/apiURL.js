/**
 * @type {string}
 * @description The API URL for the application
 * @default 'http://localhost:5000/api/v1'
 * @example 'http://localhost:5000/api/v1'
 * @example 'https://ahmedabulella.space/api/v1'
 * @example 'https://ahmedabulella.space/api/v1'
 */
let apiURL 
if(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'){
    apiURL = 'http://localhost:5000/api/v1'
}else{
    apiURL = 'https://ahmedabulella.space/api/v1'
}

export default apiURL ;