module.exports = {
    apps: [{
        name: "runway-server",
        script: "./dist/index.js",
        cwd: "./server",

        autorestart: true,
        max_restarts: 10,         // Allow more restarts before giving up
        min_uptime: "10s",        // Min uptime to consider successfully started
        restart_delay: 5000,      // Wait 5 seconds between restarts

        // Memory management - prevent memory leaks from causing system issues
        max_memory_restart: "500M",  // Restart if memory exceeds 500MB
        kill_timeout: 5000,          // Wait 5 seconds for graceful shutdown

        env: {
            NODE_ENV: "production",
            PORT: 3000
        },

        // Log configuration
        error_file: "../logs/runway-err.log",
        out_file: "../logs/runway-out.log",
        log_date_format: "YYYY-MM-DD HH:mm:ss",
        merge_logs: true,

        // Monitoring
        watch: false,             // Disable file watching in production
        ignore_watch: ["node_modules", "logs", ".git", "dist"]
    }]
}
