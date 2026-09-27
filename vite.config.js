import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 3000,
        open: true,
        hmr: true,
        host: true,
        headers: {
            "Cross-Origin-Opener-Policy": "unsafe-none",
        },
    },
    build: {
        outDir: "dist",
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ["react", "react-dom", "react-router-dom"],
                    firebase: [
                        "firebase/app",
                        "firebase/auth",
                        "firebase/firestore",
                        "firebase/storage",
                    ],
                    bootstrap: ["react-bootstrap", "bootstrap"],
                },
            },
        },
    },
});
