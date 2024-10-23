const pg = require('pg')

const pool = new pg.Pool({
    connectionString: process.env.CONNECTION_STRING
})

exports.query = (text, params, callback) => {
    return pool.query(text, params, callback)
}