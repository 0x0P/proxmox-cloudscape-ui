# Proxmox VE REST API Overview

**Version**: 9.1.2 (as of Dec 2025)  
**Base URL**: `https://your.server:8006/api2/json/`  
**Protocol**: HTTPS (port 8006)  
**Data Format**: JSON with JSON Schema validation

---

## 1. AUTHENTICATION

### 1.1 Ticket-Based Authentication (Session)

**Endpoint**: `POST /api2/json/access/ticket`

**Request**:
```bash
curl -k -d 'username=root@pam' --data-urlencode 'password=xxxxxxxxx' \
  https://10.0.0.1:8006/api2/json/access/ticket
```

**Response**:
```json
{
  "data": {
    "CSRFPreventionToken": "4EEC61E2:lwk7od06fa1+DcPUwBTXCcndyAY",
    "ticket": "PVE:root@pam:4EEC61E2::rsKoApxDTLYPn6H3NNT6iP2mv...",
    "username": "root@pam"
  }
}
```

**Key Points**:
- Tickets have a **2-hour lifetime**
- Can refresh by passing old ticket as password before expiration
- Must include ticket in `PVEAuthCookie` cookie header for subsequent requests
- **Write operations** (POST/PUT/DELETE) require `CSRFPreventionToken` header

**Usage**:
```bash
# GET request (read-only)
curl -k -b "PVEAuthCookie=PVE:root@pam:4EEC61E2::rsKoApxDTLYPn6H3NNT6iP2mv..." \
  https://10.0.0.1:8006/api2/json/nodes

# POST/PUT/DELETE (write operations)
curl -XDELETE \
  -H "CSRFPreventionToken: 4EEC61E2:lwk7od06fa1+DcPUwBTXCcndyAY" \
  -b "PVEAuthCookie=PVE:root@pam:4EEC61E2::rsKoApxDTLYPn6H3NNT6iP2mv..." \
  https://10.0.0.1:8006/api2/json/...
```

### 1.2 API Token Authentication (Stateless)

**Format**: `PVEAPIToken=USER@REALM!TOKENID=UUID`

**Request**:
```bash
curl -H 'Authorization: PVEAPIToken=root@pam!monitoring=aaaaaaaaa-bbb-cccc-dddd-ef0123456789' \
  https://10.0.0.1:8006/api2/json/
```

**Key Points**:
- **No CSRF token required** for POST/PUT/DELETE
- Tokens can have separate permissions and expiration dates
- Can be revoked without disabling the user
- Ideal for automation and API clients
- Stateless (no session management needed)

---

## 2. MAJOR API RESOURCE GROUPS

### 2.1 `/access` - Authentication & Authorization

**Key Endpoints**:
- `POST /access/ticket` - Get authentication ticket
- `GET /access/users` - List users
- `POST /access/users` - Create user
- `GET /access/users/{userid}` - Get user details
- `PUT /access/users/{userid}` - Update user
- `DELETE /access/users/{userid}` - Delete user
- `GET /access/tokens/{userid}` - List API tokens for user
- `POST /access/tokens/{userid}` - Create API token
- `DELETE /access/tokens/{userid}/{tokenid}` - Revoke token
- `GET /access/roles` - List roles
- `GET /access/acl` - Get ACL entries
- `PUT /access/acl` - Update ACL

**Permissions Model**: Role-based access control (RBAC)
- Roles: Admin, PVEAdmin, PVEAuditor, PVEDatastoreAdmin, PVEPoolAdmin, PVEOperator, PVEVMAdmin, PVEVMUser
- Scopes: `/`, `/nodes/{node}`, `/vms/{vmid}`, `/storage/{storage}`, `/pools/{pool}`

---

### 2.2 `/nodes/{node}` - Node Management

**Key Endpoints**:
- `GET /nodes` - List all cluster nodes
- `GET /nodes/{node}` - Get node info
- `GET /nodes/{node}/status` - Node status (CPU, memory, uptime, etc.)
- `GET /nodes/{node}/qemu` - List VMs on node
- `GET /nodes/{node}/lxc` - List containers on node
- `GET /nodes/{node}/storage` - List storage on node
- `GET /nodes/{node}/network` - Network configuration
- `PUT /nodes/{node}/network` - Update network config
- `GET /nodes/{node}/firewall/rules` - Firewall rules
- `POST /nodes/{node}/firewall/rules` - Add firewall rule
- `GET /nodes/{node}/apt/update` - Check for package updates
- `POST /nodes/{node}/apt/upgrade` - Upgrade packages
- `POST /nodes/{node}/reboot` - Reboot node
- `POST /nodes/{node}/shutdown` - Shutdown node
- `POST /nodes/{node}/startall` - Start all VMs/containers
- `POST /nodes/{node}/stopall` - Stop all VMs/containers
- `POST /nodes/{node}/suspendall` - Suspend all VMs
- `GET /nodes/{node}/tasks` - List node tasks
- `GET /nodes/{node}/tasks/{upid}` - Get task status

**Response Example** (`GET /nodes/{node}/status`):
```json
{
  "data": {
    "boot-info": { "firmware": "efi", "secure-boot": false },
    "cpu": 0.45,
    "cpuinfo": { "cores": 16, "sockets": 2 },
    "loadavg": [0.12, 0.18, 0.22],
    "memory": { "free": 32000000000, "total": 64000000000, "used": 32000000000 },
    "pveversion": "9.1.2",
    "rootfs": { "avail": 500000000000, "total": 1000000000000, "used": 500000000000 },
    "uptime": 2592000
  }
}
```

---

### 2.3 `/nodes/{node}/qemu` - QEMU/KVM Virtual Machines

**Key Endpoints**:
- `GET /nodes/{node}/qemu` - List VMs on node
- `POST /nodes/{node}/qemu` - Create new VM
- `GET /nodes/{node}/qemu/{vmid}` - Get VM config
- `PUT /nodes/{node}/qemu/{vmid}` - Update VM config
- `DELETE /nodes/{node}/qemu/{vmid}` - Delete VM
- `GET /nodes/{node}/qemu/{vmid}/status/current` - Get VM status
- `POST /nodes/{node}/qemu/{vmid}/status/start` - Start VM
- `POST /nodes/{node}/qemu/{vmid}/status/stop` - Stop VM (graceful)
- `POST /nodes/{node}/qemu/{vmid}/status/shutdown` - Shutdown VM
- `POST /nodes/{node}/qemu/{vmid}/status/reset` - Hard reset VM
- `POST /nodes/{node}/qemu/{vmid}/status/suspend` - Suspend VM
- `POST /nodes/{node}/qemu/{vmid}/status/resume` - Resume VM
- `POST /nodes/{node}/qemu/{vmid}/migrate` - Migrate VM to another node
- `GET /nodes/{node}/qemu/{vmid}/config` - Get full VM config
- `GET /nodes/{node}/qemu/{vmid}/pending` - Get pending config changes
- `GET /nodes/{node}/qemu/{vmid}/firewall/rules` - VM firewall rules
- `GET /nodes/{node}/qemu/{vmid}/clone` - Clone VM
- `POST /nodes/{node}/qemu/{vmid}/clone` - Execute clone
- `GET /nodes/{node}/qemu/{vmid}/vncproxy` - Get VNC proxy info
- `GET /nodes/{node}/qemu/{vmid}/spiceproxy` - Get SPICE proxy info

**VM Config Parameters** (POST/PUT):
```
vmid: integer (100-999999)
name: string (VM name)
memory: integer (MB)
cores: integer (CPU cores)
sockets: integer (CPU sockets)
numa: boolean (NUMA support)
cpu: string (CPU type: host, kvm64, etc.)
scsihw: string (SCSI controller: virtio-scsi-pci, etc.)
ide2: string (CD-ROM: local:iso/debian.iso)
net0: string (Network: model=virtio,bridge=vmbr0)
virtio0: string (Disk: storage=local-lvm,size=50G)
boot: string (Boot order: order=virtio0;ide2)
```

---

### 2.4 `/nodes/{node}/lxc` - LXC Containers

**Key Endpoints**:
- `GET /nodes/{node}/lxc` - List containers on node
- `POST /nodes/{node}/lxc` - Create new container
- `GET /nodes/{node}/lxc/{vmid}` - Get container config
- `PUT /nodes/{node}/lxc/{vmid}` - Update container config
- `DELETE /nodes/{node}/lxc/{vmid}` - Delete container
- `GET /nodes/{node}/lxc/{vmid}/status/current` - Get container status
- `POST /nodes/{node}/lxc/{vmid}/status/start` - Start container
- `POST /nodes/{node}/lxc/{vmid}/status/stop` - Stop container
- `POST /nodes/{node}/lxc/{vmid}/status/shutdown` - Shutdown container
- `POST /nodes/{node}/lxc/{vmid}/status/suspend` - Suspend container
- `POST /nodes/{node}/lxc/{vmid}/status/resume` - Resume container
- `POST /nodes/{node}/lxc/{vmid}/migrate` - Migrate container
- `GET /nodes/{node}/lxc/{vmid}/config` - Get full container config
- `GET /nodes/{node}/lxc/{vmid}/firewall/rules` - Container firewall rules
- `POST /nodes/{node}/lxc/{vmid}/clone` - Clone container

**Container Config Parameters**:
```
vmid: integer (100-999999)
hostname: string
ostype: string (debian, ubuntu, centos, etc.)
ostemplate: string (local:vztmpl/debian-11-standard_11.3-1_amd64.tar.zst)
storage: string (storage ID for root filesystem)
memory: integer (MB)
swap: integer (MB)
cores: integer (CPU cores)
net0: string (Network: name=eth0,bridge=vmbr0,ip=dhcp)
rootfs: string (Root filesystem: storage=local-lvm,size=50G)
password: string (Root password)
```

---

### 2.5 `/storage` - Storage Management

**Key Endpoints**:
- `GET /storage` - List all storage
- `POST /storage` - Create storage
- `GET /storage/{storage}` - Get storage config
- `PUT /storage/{storage}` - Update storage config
- `DELETE /storage/{storage}` - Delete storage
- `GET /storage/{storage}/content` - List storage content (ISOs, backups, etc.)
- `GET /storage/{storage}/content/{content}` - Get content info
- `DELETE /storage/{storage}/content/{content}` - Delete content

**Storage Types**:
- `dir` - Directory-based storage
- `lvmthin` - LVM thin provisioning
- `lvm` - LVM storage
- `nfs` - NFS mount
- `cifs` - CIFS/SMB mount
- `ceph` - Ceph RBD
- `zfspool` - ZFS pool

---

### 2.6 `/cluster` - Cluster Management

**Key Endpoints**:
- `GET /cluster` - Cluster info
- `GET /cluster/nodes` - List cluster nodes
- `GET /cluster/resources` - List all cluster resources (VMs, containers, nodes)
- `GET /cluster/status` - Cluster status
- `GET /cluster/options` - Cluster options
- `PUT /cluster/options` - Update cluster options
- `GET /cluster/ha/resources` - HA resources
- `POST /cluster/ha/resources` - Create HA resource
- `GET /cluster/ha/status` - HA status
- `GET /cluster/firewall/rules` - Cluster firewall rules
- `POST /cluster/firewall/rules` - Add cluster firewall rule

---

### 2.7 `/pools` - Resource Pools

**Key Endpoints**:
- `GET /pools` - List pools
- `POST /pools` - Create pool
- `GET /pools/{poolid}` - Get pool config
- `PUT /pools/{poolid}` - Update pool
- `DELETE /pools/{poolid}` - Delete pool

**Pool Config**:
```
poolid: string (pool name)
comment: string
members: array of {id, type} (VMs, containers, storage)
```

---

### 2.8 `/version` - API Version

**Endpoint**: `GET /version`

**Response**:
```json
{
  "data": {
    "version": "9.1.2",
    "release": "1",
    "repoid": "12496"
  }
}
```

---

## 3. CONSOLE & REMOTE ACCESS

### 3.1 VNC Console

**Endpoints**:
- `GET /nodes/{node}/qemu/{vmid}/vncproxy` - Get VNC proxy ticket
- `GET /nodes/{node}/qemu/{vmid}/vncwebsocket` - WebSocket VNC connection

**Response**:
```json
{
  "data": {
    "port": 61000,
    "upid": "UPID:node:...",
    "ticket": "PVE:...",
    "cert": "..."
  }
}
```

### 3.2 SPICE Console

**Endpoints**:
- `GET /nodes/{node}/qemu/{vmid}/spiceproxy` - Get SPICE proxy info
- `POST /nodes/{node}/qemu/{vmid}/spiceproxy` - Create SPICE session

### 3.3 Terminal (xterm.js)

**Endpoints**:
- `GET /nodes/{node}/termproxy` - Get terminal proxy
- `GET /nodes/{node}/vncshell` - VNC shell access
- `GET /nodes/{node}/spiceshell` - SPICE shell access

---

## 4. TASKS & BACKGROUND JOBS

**Endpoint**: `GET /nodes/{node}/tasks`

**Response**:
```json
{
  "data": [
    {
      "upid": "UPID:node:00002F9D:000DC5EA:57500527:vzcreate:602:root@pam:",
      "type": "vzcreate",
      "id": "602",
      "user": "root@pam",
      "starttime": 1464968487,
      "status": "running",
      "node": "node"
    }
  ]
}
```

**UPID Format**: `UPID:node:pid:starttime:type:id:user:`

---

## 5. API PATTERNS & CONVENTIONS

### 5.1 Response Format

**Success (GET)**:
```json
{
  "data": [...]
}
```

**Success (POST/PUT)**:
```json
{
  "data": "UPID:node:..."  // Task ID for async operations
}
```

**Error**:
```json
{
  "errors": {
    "field": "error message"
  }
}
```

### 5.2 HTTP Methods

- `GET` - Retrieve resource
- `POST` - Create resource or execute action
- `PUT` - Update resource
- `DELETE` - Delete resource

### 5.3 Query Parameters

- `limit` - Limit results (pagination)
- `start` - Start offset (pagination)
- `digest` - Config digest for optimistic locking (prevents concurrent modifications)

### 5.4 Return Formats

Specify via URL:
- `/api2/json/` - JSON (default)
- `/api2/extjs/` - JSON wrapped in ExtJS format
- `/api2/html/` - HTML (debugging)
- `/api2/text/` - Plain text (debugging)

---

## 6. RATE LIMITING & PAGINATION

**Rate Limiting**: Not explicitly documented; Proxmox uses connection-based throttling

**Pagination**:
```bash
GET /api2/json/nodes?limit=10&start=0
GET /api2/json/nodes?limit=10&start=10
```

---

## 7. PERMISSIONS & RBAC

**Permission Format**: `[action, path, [roles]...]`

**Common Permissions**:
- `Sys.Audit` - Read system info
- `Sys.Modify` - Modify system
- `Sys.PowerMgmt` - Power management
- `VM.Audit` - Read VM info
- `VM.Modify` - Modify VM
- `VM.PowerMgmt` - Power management for VMs
- `VM.Console` - Console access
- `Datastore.Audit` - Read storage info
- `Datastore.Modify` - Modify storage
- `Datastore.AllocateSpace` - Allocate storage space

---

## 8. COMMAND-LINE TOOL: `pvesh`

**Usage** (on Proxmox node as root):
```bash
# List nodes
pvesh get /nodes

# Get node status
pvesh get /nodes/{node}/status

# List VMs
pvesh get /nodes/{node}/qemu

# Create container
pvesh create /nodes/{node}/lxc \
  -vmid 100 \
  -hostname test \
  -storage local \
  -password "supersecret" \
  -ostemplate local:vztmpl/debian-11-standard_11.3-1_amd64.tar.zst \
  -memory 512 \
  -swap 512

# Start container
pvesh create /nodes/{node}/lxc/100/status/start
```

---

## 9. API STABILITY

**Compatibility Guarantee**: Within major version (e.g., 6.0 → 6.4)

**Breaking Changes** (not guaranteed across major versions):
- Removing endpoints entirely
- Moving endpoints to new paths
- Removing parameters
- Changing return type from non-null to another type

**Non-Breaking Changes**:
- Adding new parameters
- Adding new properties to responses
- Adding new endpoints
- Changing null to any type

---

## 10. OFFICIAL CLIENT LIBRARIES

**Perl** (Official):
```bash
apt-get install libpve-apiclient-perl
```

**Community Libraries**:
- **Python**: `proxmoxer` (PyPI)
- **JavaScript/Node.js**: `npm install proxmox`
- **Go**: `github.com/Telmate/proxmox-api-go`
- **Terraform**: `terraform-provider-proxmox`
- **PowerShell**: `cv4pve-api-powershell`
- **C#/.NET**: `cv4pve-api-dotnet`
- **PHP**: `pve2-api-php-client`
- **Java**: `cv4pve-api-java`

---

## 11. EXAMPLE: CREATE LXC CONTAINER

```bash
#!/bin/bash

APINODE="pve1"
TARGETNODE="pve1"
PASSWORD="yourpassword"

# Get ticket
TICKET=$(curl -s -k -d "username=root@pam&password=$PASSWORD" \
  https://$APINODE:8006/api2/json/access/ticket | jq -r '.data.ticket')

CSRF=$(curl -s -k -d "username=root@pam&password=$PASSWORD" \
  https://$APINODE:8006/api2/json/access/ticket | jq -r '.data.CSRFPreventionToken')

# Create container
curl -s -k \
  -b "PVEAuthCookie=$TICKET" \
  -H "CSRFPreventionToken: $CSRF" \
  -X POST \
  --data-urlencode net0="name=eth0,bridge=vmbr0" \
  --data-urlencode ostemplate="local:vztmpl/debian-11-standard_11.3-1_amd64.tar.zst" \
  --data vmid=100 \
  --data hostname=mycontainer \
  --data memory=512 \
  --data swap=512 \
  https://$APINODE:8006/api2/json/nodes/$TARGETNODE/lxc | jq '.'
```

---

## 12. WEBSOCKET ENDPOINTS

**VNC WebSocket**:
```
wss://your.server:8006/api2/json/nodes/{node}/qemu/{vmid}/vncwebsocket?vncticket=...&port=...
```

**Terminal WebSocket**:
```
wss://your.server:8006/api2/json/nodes/{node}/termproxy?upid=...
```

---

## 13. IMPORTANT NOTES FOR UI REPLACEMENT

1. **Authentication**: Implement both ticket and API token support
2. **Async Operations**: Tasks return UPID; poll `/nodes/{node}/tasks/{upid}` for status
3. **Permissions**: Always check user permissions before showing/enabling UI elements
4. **Digest**: Use digest field for optimistic locking on config updates
5. **WebSockets**: For console access, use WebSocket endpoints
6. **Error Handling**: Check `errors` field in responses
7. **Pagination**: Implement for large resource lists
8. **Real-time Updates**: Consider polling `/cluster/resources` or using event system

