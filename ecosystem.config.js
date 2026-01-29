module.exports = {
    apps: [{
        name: "runway-server",
        script: "./dist/index.js",
        cwd: "./server",

        autorestart: true,
        max_restarts: 3,
        restart_delay: 5000,

        env: {
            NODE_ENV: "production",
            PORT: 3000
        },

        error_file: "../logs/runway-err.log",
        out_file: "../logs/runway-out.log"
    }]
}
