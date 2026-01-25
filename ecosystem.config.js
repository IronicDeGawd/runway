module.exports = {
    apps: [{
        name: "pdcp-server",
        script: "./dist/index.js",
        cwd: "./server",
        env: {
            NODE_ENV: "production",
            PORT: 3000
        },
        error_file: "../logs/pdcp-err.log",
        out_file: "../logs/pdcp-out.log"
    }]
}
