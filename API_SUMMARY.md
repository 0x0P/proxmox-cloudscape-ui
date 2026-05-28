# Proxmox VE API - Executive Summary

## What You Have

Two comprehensive reference documents have been created for your Cloudscape UI project:

1. **PROXMOX_API_REFERENCE.md** (551 lines)
   - Complete API specification
   - All major endpoints documented
   - Authentication methods (ticket + API token)
   - Response formats and patterns
   - WebSocket endpoints for console access

2. **IMPLEMENTATION_GUIDE.md**
   - TypeScript code examples
   - Cloudscape component integration
   - State management patterns
   - Error handling strategies
   - 8-week implementation roadmap

---

## Quick Facts

| Aspect | Details |
|--------|---------|
| **Base URL** | `https://your.server:8006/api2/json/` |
| **Protocol** | HTTPS only (port 8006) |
| **Data Format** | JSON with JSON Schema validation |
| **Auth Methods** | Ticket-based (2hr) or API Token (stateless) |
| **Response Pattern** | `{ "data": ... }` or `{ "errors": ... }` |
| **Async Operations** | Return UPID (task ID) for polling |
| **Rate Limiting** | Connection-based (not documented) |
| **API Stability** | Guaranteed within major version |

---

## Core Resource Groups

```
/access          → Authentication, users, tokens, roles, ACL
/nodes/{node}    → Node status, VMs, containers, storage, network, firewall
/cluster         → Cluster resources, status, HA, firewall
/storage         → Storage management, content (ISOs, backups)
/pools           → Resource grouping
/version         → API version info
```

---

## Authentication: Two Approaches

### 1. API Token (Recommended for UI)
```bash
curl -H 'Authorization: PVEAPIToken=root@pam!tokenid=uuid' \
  https://pve.server:8006/api2/json/nodes
```
✅ Stateless | ✅ No CSRF needed | ✅ Revocable | ✅ Scoped permissions

### 2. Ticket-Based (Session)
```bash
# Get ticket
curl -d 'username=root@pam&password=...' \
  https://pve.server:8006/api2/json/access/ticket

# Use ticket
curl -b "PVEAuthCookie=..." \
  -H "CSRFPreventionToken: ..." \
  https://pve.server:8006/api2/json/nodes
```
⚠️ 2-hour expiry | ⚠️ CSRF required for writes | ✅ Session-based

---

## Key Endpoints for MVP

### Resource Discovery
```
GET /cluster/resources          # All VMs, containers, nodes
GET /nodes                      # List nodes
GET /nodes/{node}/status        # Node metrics
```

### VM Management
```
GET /nodes/{node}/qemu          # List VMs
POST /nodes/{node}/qemu         # Create VM
POST /nodes/{node}/qemu/{vmid}/status/start
POST /nodes/{node}/qemu/{vmid}/status/stop
POST /nodes/{node}/qemu/{vmid}/status/reset
GET /nodes/{node}/qemu/{vmid}/vncproxy  # Console access
```

### Container Management
```
GET /nodes/{node}/lxc           # List containers
POST /nodes/{node}/lxc          # Create container
POST /nodes/{node}/lxc/{vmid}/status/start
POST /nodes/{node}/lxc/{vmid}/status/stop
```

### Task Monitoring
```
GET /nodes/{node}/tasks         # List tasks
GET /nodes/{node}/tasks/{upid}  # Poll task status
```

---

## Response Patterns

### Success (GET)
```json
{
  "data": [
    { "id": "node1", "type": "node", "status": "online" },
    { "id": "vm-100", "type": "qemu", "status": "running" }
  ]
}
```

### Success (POST/PUT - Async)
```json
{
  "data": "UPID:node:12345:1234567890:vzcreate:100:root@pam:"
}
```
→ Poll `/nodes/{node}/tasks/{upid}` to track progress

### Error
```json
{
  "errors": {
    "vmid": "VM 100 already exists"
  }
}
```

---

## Critical Implementation Details

### 1. Async Operations
- Most create/delete/migrate operations return UPID (task ID)
- Poll `/nodes/{node}/tasks/{upid}` every 1-2 seconds
- Task complete when `status === "stopped"`
- Check `exitstatus` for success/failure

### 2. Permissions
- Every endpoint requires specific permission
- Common: `VM.Audit`, `VM.Modify`, `VM.PowerMgmt`, `Sys.Audit`
- Disable UI actions if user lacks permission

### 3. Optimistic Locking
- Config endpoints return `digest` field
- Include digest in PUT requests
- If mismatch: re-fetch and retry

### 4. WebSockets for Console
```
wss://host:8006/api2/json/nodes/{node}/qemu/{vmid}/vncwebsocket?ticket=...
```
- Use noVNC library for rendering
- Requires ticket from `/vncproxy` endpoint

### 5. Pagination
```bash
GET /nodes?limit=50&start=0
GET /nodes?limit=50&start=50
```

---

## Data Models for Cloudscape

### Node
```typescript
{
  node: string;
  status: "online" | "offline";
  uptime: number;
  cpu: number;           // 0-1
  maxcpu: number;
  memory: number;        // bytes
  maxmemory: number;
  disk: number;
  maxdisk: number;
}
```

### VM/Container
```typescript
{
  vmid: number;
  name: string;
  type: "qemu" | "lxc";
  status: "running" | "stopped" | "paused";
  node: string;
  uptime: number;
  cpu: number;
  maxcpu: number;
  memory: number;
  maxmemory: number;
}
```

### Task
```typescript
{
  upid: string;
  type: string;          // vzcreate, qmstart, etc.
  id: string;
  user: string;
  starttime: number;
  status: "running" | "stopped";
  exitstatus: "ok" | "error";
  node: string;
}
```

---

## Implementation Priorities

### Phase 1: Foundation (Week 1-2)
- [ ] API token authentication
- [ ] Basic API client wrapper
- [ ] Login form (Cloudscape)
- [ ] Resource listing table with pagination

### Phase 2: Core Operations (Week 3-4)
- [ ] VM/Container CRUD
- [ ] Power operations (start/stop/reset)
- [ ] Task monitoring with progress
- [ ] Error handling & retry logic

### Phase 3: Advanced (Week 5-6)
- [ ] Console access (VNC/SPICE)
- [ ] Storage management
- [ ] Network configuration
- [ ] Firewall rules

### Phase 4: Polish (Week 7-8)
- [ ] Real-time updates
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] Testing & documentation

---

## Testing Checklist

- [ ] Authentication with API token
- [ ] List resources from cluster
- [ ] Create VM/container
- [ ] Power operations (start/stop/reset)
- [ ] Task polling and completion
- [ ] Error handling (invalid credentials, network errors)
- [ ] Console access (VNC proxy)
- [ ] Pagination with large resource lists
- [ ] Concurrent operations
- [ ] Permission checks

---

## Security Checklist

- [ ] HTTPS only (no HTTP)
- [ ] Validate all user inputs
- [ ] Don't expose API errors in UI
- [ ] Implement token rotation
- [ ] Check permissions before enabling actions
- [ ] Use proper CORS headers or proxy
- [ ] Store credentials securely (localStorage with caution)
- [ ] Implement logout/session cleanup

---

## Common Pitfalls to Avoid

1. **Forgetting CSRF token** - Required for POST/PUT/DELETE with ticket auth
2. **Not polling tasks** - Operations are async; must wait for completion
3. **Ignoring permissions** - Always check user role before enabling actions
4. **Missing error handling** - API returns detailed error objects
5. **Hardcoding node names** - Use dynamic discovery from `/nodes`
6. **Not handling 2-hour ticket expiry** - Implement refresh or use API tokens
7. **Blocking on async operations** - Show progress UI while tasks run
8. **Not validating digest** - Can cause concurrent modification conflicts

---

## Official Resources

- **API Viewer**: https://pve.proxmox.com/pve-docs/api-viewer/
- **Wiki**: https://pve.proxmox.com/wiki/Proxmox_VE_API
- **Admin Guide**: https://pve.proxmox.com/pve-docs/pve-admin-guide.html
- **Cloudscape**: https://cloudscape.design/

---

## Next Steps

1. **Review** the two reference documents
2. **Set up** API token on your Proxmox instance
3. **Start** with Phase 1 (authentication + resource listing)
4. **Test** each endpoint with curl before integrating
5. **Implement** Cloudscape components incrementally
6. **Monitor** task completion with polling
7. **Add** error handling and retry logic
8. **Iterate** through phases 2-4

---

## Questions to Answer Before Starting

1. Which Proxmox features are critical for your use case?
2. Do you need real-time updates or is polling acceptable?
3. Will you support both VMs and containers?
4. Do you need console access (VNC/SPICE)?
5. What's your target browser/device support?
6. Do you need multi-user support with RBAC?
7. Will you integrate with existing monitoring/alerting?

---

**Created**: April 2026  
**Proxmox Version**: 9.1.2  
**API Version**: 2 (JSON)  
**Status**: Ready for implementation

