const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: "localhost",
    user: "fintrax_user",       
    password: "1234",     
    database: "fintrax"
});

module.exports = pool;