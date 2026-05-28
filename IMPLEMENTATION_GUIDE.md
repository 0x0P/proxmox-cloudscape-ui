# Proxmox VE UI Implementation Guide for Cloudscape

## Overview

This guide maps Proxmox VE API concepts to Cloudscape Design System components for building a modern replacement UI.

---

## 1. Authentication Layer

### Recommended Approach: API Token (Stateless)

**Why**: 
- No session management complexity
- Better for SPA (Single Page Application)
- Can be revoked independently
- Easier to test and debug

**Implementation**:

```typescript
// src/services/proxmox-auth.ts
interface ProxmoxCredentials {
  host: string;
  username: string;
  realm: string;  // 'pam', 'pve', etc.
  tokenId: string;
  tokenSecret: string;
}

class ProxmoxAuthService {
  private credentials: ProxmoxCredentials;
  private baseUrl: string;

  constructor(credentials: ProxmoxCredentials) {
    this.credentials = credentials;
    this.baseUrl = `https://${credentials.host}:8006/api2/json`;
  }

  getAuthHeader(): Record<string, string> {
    const { username, realm, tokenId, tokenSecret } = this.credentials;
    const token = `${username}@${realm}!${tokenId}=${tokenSecret}`;
    return {
      'Authorization': `PVEAPIToken=${token}`,
      'Content-Type': 'application/json'
    };
  }

  async request<T>(
    method: string,
    path: string,
    data?: Record<string, any>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: this.getAuthHeader(),
      // Ignore self-signed cert for dev (use proper certs in prod)
      // This requires a proxy or proper certificate setup
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = new URLSearchParams(data).toString();
      options.headers = {
        ...options.headers,
        'Content-Type': 'application/x-www-form-urlencoded'
      };
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    return response.json();
  }
}
```

### Cloudscape Component: Login Form

```typescript
// src/components/LoginForm.tsx
import { Form, FormField, Input, Button, Container, Header } from '@cloudscape-design/components';

export function LoginForm({ onLogin }: { onLogin: (creds: any) => void }) {
  const [formData, setFormData] = useState({
    host: '',
    username: '',
    tokenId: '',
    tokenSecret: ''
  });

  return (
    <Container>
      <Form
        actions={
          <Button variant="primary" onClick={() => onLogin(formData)}>
            Connect
          </Button>
        }
      >
        <FormField label="Proxmox Host">
          <Input
            value={formData.host}
            onChange={(e) => setFormData({ ...formData, host: e.detail.value })}
            placeholder="pve.example.com"
          />
        </FormField>
        <FormField label="Username">
          <Input
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.detail.value })}
            placeholder="root"
          />
        </FormField>
        <FormField label="API Token ID">
          <Input
            value={formData.tokenId}
            onChange={(e) => setFormData({ ...formData, tokenId: e.detail.value })}
            placeholder="monitoring"
          />
        </FormField>
        <FormField label="API Token Secret">
          <Input
            type="password"
            value={formData.tokenSecret}
            onChange={(e) => setFormData({ ...formData, tokenSecret: e.detail.value })}
          />
        </FormField>
      </Form>
    </Container>
  );
}
```

---

## 2. Resource Listing (Nodes, VMs, Containers)

### Data Fetching Pattern

```typescript
// src/services/proxmox-api.ts
class ProxmoxAPI {
  constructor(private auth: ProxmoxAuthService) {}

  async getClusterResources() {
    const response = await this.auth.request<any>(
      'GET',
      '/cluster/resources'
    );
    return response.data;
  }

  async getNodes() {
    const response = await this.auth.request<any>('GET', '/nodes');
    return response.data;
  }

  async getNodeStatus(node: string) {
    const response = await this.auth.request<any>(
      'GET',
      `/nodes/${node}/status`
    );
    return response.data;
  }

  async getVMs(node: string) {
    const response = await this.auth.request<any>(
      'GET',
      `/nodes/${node}/qemu`
    );
    return response.data;
  }

  async getContainers(node: string) {
    const response = await this.auth.request<any>(
      'GET',
      `/nodes/${node}/lxc`
    );
    return response.data;
  }
}
```

### Cloudscape Table Component

```typescript
// src/components/ResourcesTable.tsx
import { Table, Header, Pagination, TextFilter } from '@cloudscape-design/components';
import { useEffect, useState } from 'react';

export function ResourcesTable({ api }: { api: ProxmoxAPI }) {
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const data = await api.getClusterResources();
        setResources(data);
      } catch (error) {
        console.error('Failed to fetch resources:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchResources();
    // Poll every 5 seconds for updates
    const interval = setInterval(fetchResources, 5000);
    return () => clearInterval(interval);
  }, [api]);

  const filtered = resources.filter(r =>
    r.id?.includes(filterText) || r.name?.includes(filterText)
  );

  const pageSize = 20;
  const paginatedItems = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <Table
      columnDefinitions={[
        {
          id: 'id',
          header: 'ID',
          cell: (item) => item.id
        },
        {
          id: 'type',
          header: 'Type',
          cell: (item) => item.type
        },
        {
          id: 'status',
          header: 'Status',
          cell: (item) => (
            <StatusBadge status={item.status} />
          )
        },
        {
          id: 'node',
          header: 'Node',
          cell: (item) => item.node
        },
        {
          id: 'cpu',
          header: 'CPU',
          cell: (item) => `${(item.cpu * 100).toFixed(1)}%`
        },
        {
          id: 'memory',
          header: 'Memory',
          cell: (item) => formatBytes(item.mem)
        }
      ]}
      items={paginatedItems}
      loading={loading}
      header={<Header>Cluster Resources</Header>}
      pagination={
        <Pagination
          currentPageIndex={currentPage}
          pagesCount={Math.ceil(filtered.length / pageSize)}
          onChange={(e) => setCurrentPage(e.detail.currentPageIndex)}
        />
      }
      filter={
        <TextFilter
          filteringText={filterText}
          onChange={(e) => setFilterText(e.detail.filteringText)}
          placeholder="Search resources..."
        />
      }
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    'running': 'green',
    'stopped': 'red',
    'online': 'green',
    'offline': 'red',
    'paused': 'orange'
  };
  return <span style={{ color: colorMap[status] || 'gray' }}>{status}</span>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
```

---

## 3. VM/Container Management

### Power Operations

```typescript
// src/services/proxmox-api.ts (continued)
class ProxmoxAPI {
  async startVM(node: string, vmid: number) {
    return this.executeTask(
      'POST',
      `/nodes/${node}/qemu/${vmid}/status/start`
    );
  }

  async stopVM(node: string, vmid: number) {
    return this.executeTask(
      'POST',
      `/nodes/${node}/qemu/${vmid}/status/stop`
    );
  }

  async resetVM(node: string, vmid: number) {
    return this.executeTask(
      'POST',
      `/nodes/${node}/qemu/${vmid}/status/reset`
    );
  }

  async startContainer(node: string, vmid: number) {
    return this.executeTask(
      'POST',
      `/nodes/${node}/lxc/${vmid}/status/start`
    );
  }

  async stopContainer(node: string, vmid: number) {
    return this.executeTask(
      'POST',
      `/nodes/${node}/lxc/${vmid}/status/stop`
    );
  }

  private async executeTask(method: string, path: string, data?: any) {
    const response = await this.auth.request<any>(method, path, data);
    const upid = response.data;
    return this.waitForTask(upid);
  }

  private async waitForTask(upid: string) {
    // Parse UPID: UPID:node:pid:starttime:type:id:user:
    const parts = upid.split(':');
    const node = parts[1];
    
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          const response = await this.auth.request<any>(
            'GET',
            `/nodes/${node}/tasks/${upid}`
          );
          const task = response.data;
          
          if (task.status === 'stopped') {
            if (task.exitstatus === 'ok') {
              resolve(task);
            } else {
              reject(new Error(task.exitstatus));
            }
          } else {
            setTimeout(checkStatus, 1000);
          }
        } catch (error) {
          reject(error);
        }
      };
      checkStatus();
    });
  }
}
```

### Cloudscape Modal for Actions

```typescript
// src/components/VMActionsModal.tsx
import { Modal, Button, SpaceBetween, Box } from '@cloudscape-design/components';
import { useState } from 'react';

export function VMActionsModal({
  visible,
  vm,
  onClose,
  api
}: {
  visible: boolean;
  vm: any;
  onClose: () => void;
  api: ProxmoxAPI;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: string) => {
    setLoading(true);
    setError(null);
    try {
      if (action === 'start') {
        await api.startVM(vm.node, vm.vmid);
      } else if (action === 'stop') {
        await api.stopVM(vm.node, vm.vmid);
      } else if (action === 'reset') {
        await api.resetVM(vm.node, vm.vmid);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      onDismiss={onClose}
      visible={visible}
      header={`Actions for ${vm.name}`}
      footer={
        <Box float="right">
          <Button onClick={onClose}>Close</Button>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="m">
        {error && <Box color="text-status-error">{error}</Box>}
        <SpaceBetween direction="horizontal" size="xs">
          <Button
            onClick={() => handleAction('start')}
            disabled={vm.status === 'running' || loading}
          >
            Start
          </Button>
          <Button
            onClick={() => handleAction('stop')}
            disabled={vm.status === 'stopped' || loading}
          >
            Stop
          </Button>
          <Button
            onClick={() => handleAction('reset')}
            disabled={loading}
          >
            Reset
          </Button>
        </SpaceBetween>
      </SpaceBetween>
    </Modal>
  );
}
```

---

## 4. Task Monitoring

### Background Task Tracker

```typescript
// src/hooks/useTaskMonitor.ts
import { useState, useEffect } from 'react';

export function useTaskMonitor(api: ProxmoxAPI) {
  const [tasks, setTasks] = useState<Map<string, any>>(new Map());

  const addTask = (upid: string, description: string) => {
    setTasks(prev => new Map(prev).set(upid, {
      upid,
      description,
      status: 'running',
      progress: 0,
      startTime: Date.now()
    }));
  };

  useEffect(() => {
    const checkTasks = async () => {
      const updated = new Map(tasks);
      
      for (const [upid, task] of tasks) {
        try {
          const parts = upid.split(':');
          const node = parts[1];
          const response = await api.auth.request<any>(
            'GET',
            `/nodes/${node}/tasks/${upid}`
          );
          const taskData = response.data;

          if (taskData.status === 'stopped') {
            updated.set(upid, {
              ...task,
              status: 'completed',
              exitstatus: taskData.exitstatus
            });
          }
        } catch (error) {
          console.error('Failed to check task:', error);
        }
      }
      
      setTasks(updated);
    };

    if (tasks.size > 0) {
      const interval = setInterval(checkTasks, 1000);
      return () => clearInterval(interval);
    }
  }, [tasks, api]);

  return { tasks, addTask };
}
```

### Cloudscape Notifications

```typescript
// src/components/TaskNotifications.tsx
import { Flashbar, Flash } from '@cloudscape-design/components';

export function TaskNotifications({ tasks }: { tasks: Map<string, any> }) {
  const items: any[] = [];

  for (const [, task] of tasks) {
    if (task.status === 'completed') {
      items.push({
        type: task.exitstatus === 'ok' ? 'success' : 'error',
        content: `${task.description}: ${task.exitstatus}`,
        dismissible: true
      });
    } else {
      items.push({
        type: 'info',
        content: `${task.description}: Running...`,
        loading: true
      });
    }
  }

  return <Flashbar items={items} />;
}
```

---

## 5. Console Access (VNC/SPICE)

### Console Proxy Handler

```typescript
// src/services/console-service.ts
class ConsoleService {
  constructor(private auth: ProxmoxAuthService) {}

  async getVNCProxy(node: string, vmid: number) {
    const response = await this.auth.request<any>(
      'GET',
      `/nodes/${node}/qemu/${vmid}/vncproxy`
    );
    return response.data;
  }

  async getSPICEProxy(node: string, vmid: number) {
    const response = await this.auth.request<any>(
      'GET',
      `/nodes/${node}/qemu/${vmid}/spiceproxy`
    );
    return response.data;
  }

  buildVNCWebSocketURL(
    host: string,
    node: string,
    vmid: number,
    proxyData: any
  ): string {
    const params = new URLSearchParams({
      vncticket: proxyData.ticket,
      port: proxyData.port,
      path: `nodes/${node}/qemu/${vmid}/vncwebsocket`
    });
    return `wss://${host}:8006/api2/json/nodes/${node}/qemu/${vmid}/vncwebsocket?${params}`;
  }
}
```

### Cloudscape Modal with Console

```typescript
// src/components/ConsoleModal.tsx
import { Modal, Box, Button } from '@cloudscape-design/components';
import { useEffect, useRef } from 'react';

export function ConsoleModal({
  visible,
  vm,
  onClose,
  consoleService
}: {
  visible: boolean;
  vm: any;
  onClose: () => void;
  consoleService: ConsoleService;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;

    const setupConsole = async () => {
      try {
        const proxyData = await consoleService.getVNCProxy(vm.node, vm.vmid);
        const wsURL = consoleService.buildVNCWebSocketURL(
          'your-host',
          vm.node,
          vm.vmid,
          proxyData
        );

        // Use noVNC library for actual VNC rendering
        // This is a simplified example
        console.log('Connecting to:', wsURL);
      } catch (error) {
        console.error('Failed to setup console:', error);
      }
    };

    setupConsole();
  }, [visible, vm, consoleService]);

  return (
    <Modal
      onDismiss={onClose}
      visible={visible}
      header={`Console: ${vm.name}`}
      size="large"
    >
      <Box>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '600px',
            backgroundColor: '#000'
          }}
        />
      </Box>
    </Modal>
  );
}
```

---

## 6. Error Handling & Retry Logic

```typescript
// src/utils/api-error-handler.ts
export class APIError extends Error {
  constructor(
    public statusCode: number,
    public errors: Record<string, string>,
    message: string
  ) {
    super(message);
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }

  throw lastError;
}
```

---

## 7. State Management (Recommended: Zustand or Redux)

```typescript
// src/store/proxmox-store.ts
import { create } from 'zustand';

interface ProxmoxStore {
  // Auth
  credentials: any | null;
  setCredentials: (creds: any) => void;

  // Resources
  resources: any[];
  setResources: (resources: any[]) => void;

  // UI State
  selectedResource: any | null;
  setSelectedResource: (resource: any) => void;

  // Tasks
  tasks: Map<string, any>;
  addTask: (upid: string, description: string) => void;
}

export const useProxmoxStore = create<ProxmoxStore>((set) => ({
  credentials: null,
  setCredentials: (creds) => set({ credentials: creds }),

  resources: [],
  setResources: (resources) => set({ resources }),

  selectedResource: null,
  setSelectedResource: (resource) => set({ selectedResource: resource }),

  tasks: new Map(),
  addTask: (upid, description) =>
    set((state) => {
      const newTasks = new Map(state.tasks);
      newTasks.set(upid, { upid, description, status: 'running' });
      return { tasks: newTasks };
    })
}));
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Authentication (API token)
- [ ] Basic API client
- [ ] Login form (Cloudscape)
- [ ] Resource listing table

### Phase 2: Core Operations (Week 3-4)
- [ ] VM/Container CRUD
- [ ] Power operations (start/stop/reset)
- [ ] Task monitoring
- [ ] Error handling

### Phase 3: Advanced Features (Week 5-6)
- [ ] Console access (VNC/SPICE)
- [ ] Storage management
- [ ] Network configuration
- [ ] Firewall rules

### Phase 4: Polish (Week 7-8)
- [ ] Real-time updates (WebSocket or polling)
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] Testing & documentation

---

## 9. Testing Strategy

```typescript
// src/__tests__/proxmox-api.test.ts
import { ProxmoxAPI } from '../services/proxmox-api';

describe('ProxmoxAPI', () => {
  let api: ProxmoxAPI;
  let mockAuth: any;

  beforeEach(() => {
    mockAuth = {
      request: jest.fn()
    };
    api = new ProxmoxAPI(mockAuth);
  });

  test('getClusterResources returns resources', async () => {
    mockAuth.request.mockResolvedValue({
      data: [{ id: 'node1', type: 'node' }]
    });

    const resources = await api.getClusterResources();
    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe('node1');
  });

  test('startVM executes task and waits for completion', async () => {
    mockAuth.request
      .mockResolvedValueOnce({ data: 'UPID:node:123:...' })
      .mockResolvedValueOnce({ data: { status: 'stopped', exitstatus: 'ok' } });

    const result = await api.startVM('node1', 100);
    expect(result.exitstatus).toBe('ok');
  });
});
```

---

## 10. Security Considerations

1. **HTTPS Only**: Always use HTTPS (port 8006)
2. **Token Rotation**: Implement token refresh/rotation
3. **CORS**: Set up proper CORS headers or use a proxy
4. **Input Validation**: Validate all user inputs before API calls
5. **Error Messages**: Don't expose sensitive API details in UI errors
6. **Permissions**: Always check user permissions before enabling actions

---

## Resources

- Proxmox API Reference: `/PROXMOX_API_REFERENCE.md`
- Cloudscape Components: https://cloudscape.design/
- Official Proxmox Docs: https://pve.proxmox.com/pve-docs/
- API Viewer: https://pve.proxmox.com/pve-docs/api-viewer/

