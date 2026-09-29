import {defineConfig} from "vite";export default defineConfig({server:{host:"127.0.0.1",proxy:{"/api/policy-edit-sessions":"http://127.0.0.1:4175","/api":"http://127.0.0.1:4174"}}});
