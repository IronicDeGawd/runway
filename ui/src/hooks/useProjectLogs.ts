import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useProjectLogs(projectId: string | undefined, active: boolean) {
    const [logs, setLogs] = useState<string[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!projectId || !active) return;

        // Connect to namespace
        const socket: Socket = io('/logs', {
             path: '/socket.io',
             transports: ['websocket'],
        });

        socket.on('connect', () => {
            setIsConnected(true);
            socket.emit('subscribe', projectId);
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
        });

        socket.on('log', (data: { projectId: string, log: string }) => {
            if (data.projectId === projectId) {
                setLogs(prev => [...prev, data.log]);
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [projectId, active]);

    return { logs, isConnected, clearLogs: () => setLogs([]) };
}
