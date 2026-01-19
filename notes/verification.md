# 404 verification

Commands and outputs captured while checking the claim:

```bash
ls /workspace/eng
```

```
DEPLOY.TXT
public
tsconfig.node.tsbuildinfo
deploy.sh
readme.md
tsconfig.tsbuildinfo
dist
src
types
node_modules
tailwind.config.ts
vite.config.d.ts
package-lock.json
todo
vite.config.ts
package.json
tsconfig.json
postcss.config.js
tsconfig.node.json
```

```bash
npm run dev -- --host 0.0.0.0 --port 4173
```

```
VITE v5.4.20  ready in 423 ms

➜  Local:   http://localhost:4173/
➜  Network: http://172.31.0.242:4173/
```

```bash
curl -s -o /tmp/root.html -w "%{http_code}" http://127.0.0.1:4173/
```

```
404
```
