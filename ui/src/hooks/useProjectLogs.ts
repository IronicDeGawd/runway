import { useEffect, useState } from 'react';

export function useProjectLogs(projectId: string | undefined, active: boolean) {
    const [logs, setLogs] = useState<string[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!projectId || !active) return;

        const token = localStorage.getItem('token');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/logs?token=${token}`;
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            setIsConnected(true);
            ws.send(JSON.stringify({ action: 'subscribe', projectId }));
        };

        ws.onclose = () => {
            setIsConnected(false);
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'log' && data.projectId === projectId) {
                setLogs(prev => [...prev, data.log]);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            setIsConnected(false);
        };

        return () => {
            ws.close();
        };
    }, [projectId, active]);

    return { logs, isConnected, clearLogs: () => setLogs([]) };
}
