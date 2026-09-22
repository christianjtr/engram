import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';

const PORT = 7438;
const HOST = '127.0.0.1';

const PUBLIC_DIR = path.join(__dirname, 'public');
const SNAPSHOT_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', '.engram', 'semantic-graph');

async function getLatestSnapshot(): Promise<string | null> {
    try {
        const entries = await fs.readdir(SNAPSHOT_DIR);
        const snapshots = entries.filter(f => f.startsWith('engram_semantic_graph_') && f.endsWith('.json'));

        if (snapshots.length === 0) return null;

        const withStats = await Promise.all(
            snapshots.map(async (f) => {
                const fullPath = path.join(SNAPSHOT_DIR, f);
                const stat = await fs.stat(fullPath);
                return { fullPath, mtimeMs: stat.mtimeMs };
            })
        );

        withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
        return withStats[0].fullPath;
    } catch {
        return null;
    }
}

const server = http.createServer((req, res) => {
    if (req.url === '/graph.json') {
        getLatestSnapshot().then((snapshotPath) => {
            if (!snapshotPath) {
                res.writeHead(404);
                res.end('No snapshot found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            import('fs').then(({ createReadStream }) => {
                createReadStream(snapshotPath).pipe(res);
            });
        }).catch(() => {
            res.writeHead(500);
            res.end('Internal server error');
        });
        return;
    }

    const urlPath = req.url === '/' ? 'index.html' : (req.url || 'index.html');
    const filePath = path.join(PUBLIC_DIR, urlPath);

    fs.readFile(filePath).then((data) => {
        const ext = path.extname(filePath);
        const contentType: Record<string, string> = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
        };
        res.writeHead(200, { 'Content-Type': contentType[ext] || 'text/plain' });
        res.end(data);
    }).catch(() => {
        res.writeHead(404);
        res.end('Not found');
    });
});

server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`Visualizer running at ${url}`);

    const platform = process.platform;
    const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${command} ${url}`);
});
