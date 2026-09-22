import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const PORT = 7438;
const HOST = '127.0.0.1';

const PUBLIC_DIR = path.join(__dirname, 'public');
const SNAPSHOT_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', '.engram', 'semantic-graph');

function getLatestSnapshot(): string | null {
    if (!fs.existsSync(SNAPSHOT_DIR)) return null;

    const files = fs.readdirSync(SNAPSHOT_DIR)
        .filter(f => f.startsWith('engram_semantic_graph_') && f.endsWith('.json'))
        .map(f => path.join(SNAPSHOT_DIR, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    return files.length > 0 ? files[0] : null;
}

const server = http.createServer((req, res) => {
    if (req.url === '/graph.json') {
        const snapshotPath = getLatestSnapshot();
        if (!snapshotPath) {
            res.writeHead(404);
            res.end('No snapshot found');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        fs.createReadStream(snapshotPath).pipe(res);
        return;
    }

    // Serve static files
    let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url || 'index.html');

    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    const ext = path.extname(filePath);
    const contentType: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
    };

    res.writeHead(200, { 'Content-Type': contentType[ext] || 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`Visualizer running at ${url}`);

    // Open browser
    const platform = process.platform;
    const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${command} ${url}`);
});
