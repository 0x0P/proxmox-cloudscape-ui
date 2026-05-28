# Proxmox VE API Specification

**Official API Viewer**: https://pve.proxmox.com/pve-docs/api-viewer/index.html

**Base URL**: `https://your.server:8006/api2/json/`

**API Documentation**: https://pve.proxmox.com/wiki/Proxmox_VE_API

---

## Storage Management

### POST /storage - Create Storage Pool
**Description**: Create a new storage.

**Parameters**:
- `storage` (string, required): Storage identifier
- `type` (string, required): Storage type - one of: `dir`, `nfs`, `cifs`, `lvm`, `lvmthin`, `zfspool`, `iscsi`, `glusterfs`, `btrfs`, `cephfs`, `esxi`, `iscsidirect`, `pbs`, `rbd`
- `content` (string, optional): Allowed content types (images, rootdir, backup, etc.)
- `nodes` (string, optional): Nodes allowed to use this storage
- `disable` (boolean, optional): Disable storage
- `maxfiles` (integer, optional): Maximum number of backup files
- `prune-backups` (string, optional): Backup retention rules
- `bwlimit` (object, optional): Bandwidth limits with properties: `clone`, `default`, `restore`, `migration`

**Type-specific parameters**:

#### dir (Directory)
- `path` (string, required): Directory path
- `content` (string, optional): Allowed content types
- `nodes` (string, optional): Nodes allowed to use this storage
- `maxfiles` (integer, optional): Maximum backup files
- `prune-backups` (string, optional): Retention rules

#### nfs (NFS)
- `server` (string, required): NFS server hostname/IP
- `export` (string, required): NFS export path
- `path` (string, required): Local mount path
- `content` (string, optional): Allowed content types
- `nodes` (string, optional): Nodes allowed to use this storage
- `options` (string, optional): NFS mount options

#### cifs (CIFS/SMB)
- `server` (string, required): CIFS server hostname/IP
- `share` (string, required): CIFS share name
- `path` (string, required): Local mount path
- `username` (string, optional): CIFS username
- `password` (string, optional): CIFS password
- `domain` (string, optional): CIFS domain
- `content` (string, optional): Allowed content types

#### lvm (LVM)
- `vgname` (string, required): LVM volume group name
- `content` (string, optional): Allowed content types (images, rootdir)
- `nodes` (string, optional): Nodes allowed to use this storage

#### lvmthin (LVM Thin)
- `vgname` (string, required): LVM volume group name
- `thinpool` (string, required): LVM thin pool name
- `content` (string, optional): Allowed content types

#### zfspool (ZFS)
- `pool` (string, required): ZFS pool name
- `content` (string, optional): Allowed content types
- `nodes` (string, optional): Nodes allowed to use this storage

#### iscsi (iSCSI)
- `portal` (string, required): iSCSI portal (IP:port)
- `target` (string, required): iSCSI target name
- `content` (string, optional): Allowed content types (images)

#### glusterfs (GlusterFS)
- `server` (string, required): GlusterFS server
- `volume` (string, required): GlusterFS volume name
- `path` (string, required): Local mount path

**Response**: `{ "storage": "storage-name" }`

**Permissions**: `Datastore.Allocate` on `/storage`

---

### GET /storage - List Storage Pools
**Description**: Storage index.

**Parameters**:
- `type` (string, optional): Filter by storage type (enum: btrfs, cephfs, cifs, dir, esxi, iscsi, iscsidirect, lvm, lvmthin, nfs, pbs, rbd, zfs, zfspool)

**Response**:
```json
[
  {
    "storage": "local",
    "type": "dir",
    "content": "images,rootdir",
    "active": 1,
    "enabled": 1,
    "nodes": "node1,node2"
  }
]
```

**Permissions**: `Datastore.Audit` or `Datastore.AllocateSpace` on `/storage/<storage>`

---

### PUT /storage/{storage} - Update Storage Config
**Description**: Update storage configuration.

**Parameters**: Same as POST (all optional except storage identifier in path)

**Response**: `{ "storage": "storage-name" }`

**Permissions**: `Datastore.Allocate` on `/storage/{storage}`

---

### DELETE /storage/{storage} - Delete Storage Pool
**Description**: Delete storage pool.

**Parameters**:
- `storage` (string, required): Storage identifier (in path)
- `force` (boolean, optional): Force deletion even if in use

**Response**: `null`

**Permissions**: `Datastore.Allocate` on `/storage/{storage}`

---

## Network Management

### GET /nodes/{node}/network - List Network Interfaces
**Description**: List available networks.

**Parameters**:
- `node` (string, required): Cluster node name
- `type` (string, optional): Filter by interface type (enum: bridge, bond, eth, alias, vlan, fabric, OVSBridge, OVSBond, OVSPort, OVSIntPort, vnet, any_bridge, any_local_bridge, include_sdn)

**Response**:
```json
[
  {
    "iface": "vmbr0",
    "type": "bridge",
    "active": 1,
    "autostart": 1,
    "address": "192.168.1.100",
    "netmask": "255.255.255.0",
    "gateway": "192.168.1.1",
    "bridge_ports": "eth0",
    "bridge_vlan_aware": 0
  }
]
```

**Permissions**: All users

---

### POST /nodes/{node}/network - Create Network Interface
**Description**: Create network interface.

**Parameters**:
- `node` (string, required): Cluster node name
- `iface` (string, required): Interface name (2-20 chars)
- `type` (string, required): Interface type (bridge, bond, vlan, OVSBridge, OVSBond, OVSPort, OVSIntPort)
- `autostart` (boolean, optional): Auto-start on boot
- `comments` (string, optional): Interface comments
- `address` (string, optional): IPv4 address
- `netmask` (string, optional): IPv4 netmask
- `gateway` (string, optional): IPv4 gateway
- `address6` (string, optional): IPv6 address
- `netmask6` (integer, optional): IPv6 prefix (0-128)
- `gateway6` (string, optional): IPv6 gateway
- `mtu` (integer, optional): MTU (1280-65520)

**Bridge-specific**:
- `bridge_ports` (string, optional): Interfaces to add (space-separated)
- `bridge_vlan_aware` (boolean, optional): Enable VLAN awareness
- `bridge_vids` (string, optional): VLAN IDs (e.g., "2 4 100-200")

**Bond-specific**:
- `bond_slaves` (string, optional): Slave interfaces (space-separated)
- `bond_mode` (string, optional): Mode (balance-rr, active-backup, balance-xor, broadcast, 802.3ad, balance-tlb, balance-alb, balance-slb, lacp-balance-slb, lacp-balance-tcp)
- `bond_xmit_hash_policy` (string, optional): Hash policy (layer2, layer2+3, layer3+4)
- `bond-primary` (string, optional): Primary interface for active-backup

**VLAN-specific**:
- `vlan-raw-device` (string, optional): Parent interface
- `vlan-id` (integer, optional): VLAN ID (1-4094)

**Response**: `null`

**Permissions**: `Sys.Modify` on `/nodes/{node}`

---

### PUT /nodes/{node}/network/{iface} - Update Network Interface
**Description**: Update network interface configuration.

**Parameters**: Same as POST (all optional)

**Response**: `null`

**Permissions**: `Sys.Modify` on `/nodes/{node}`

---

### DELETE /nodes/{node}/network/{iface} - Delete Network Interface
**Description**: Delete network interface.

**Parameters**:
- `node` (string, required): Cluster node name
- `iface` (string, required): Interface name

**Response**: `null`

**Permissions**: `Sys.Modify` on `/nodes/{node}`

---

### PUT /nodes/{node}/network - Apply Network Changes
**Description**: Revert network configuration changes (reload).

**Parameters**:
- `node` (string, required): Cluster node name

**Response**: `null`

**Permissions**: `Sys.Modify` on `/nodes/{node}`

---

## VM Configuration & CloudInit

### GET /nodes/{node}/qemu/{vmid}/config - Get VM Config
**Description**: Get the virtual machine configuration with both current and pending values.

**Parameters**:
- `node` (string, required): Cluster node name
- `vmid` (integer, required): VM ID (100-999999999)

**Response**:
```json
{
  "boot": "order=scsi0;net0",
  "agent": 1,
  "protection": 0,
  "onboot": 1,
  "hotplug": "network,disk,usb",
  "tablet": 1,
  "localtime": 0,
  "freeze": 0,
  "ciuser": "root",
  "cipassword": "password",
  "nameserver": "8.8.8.8",
  "searchdomain": "example.com",
  "ipconfig0": "ip=192.168.1.100/24,gw=192.168.1.1",
  "sshkeys": "ssh-rsa AAAA...",
  "citype": "nocloud",
  "cores": 4,
  "memory": 2048,
  "sockets": 1,
  "numa": 0,
  "vcpus": 0
}
```

**Permissions**: `VM.Audit` on `/vms/{vmid}`

---

### PUT /nodes/{node}/qemu/{vmid}/config - Update VM Config
**Description**: Update virtual machine configuration.

**Parameters**:
- `node` (string, required): Cluster node name
- `vmid` (integer, required): VM ID
- `boot` (string, optional): Boot order (e.g., "order=scsi0;net0")
- `agent` (boolean, optional): Enable QEMU guest agent
- `protection` (boolean, optional): Prevent accidental removal
- `onboot` (boolean, optional): Start on node boot
- `hotplug` (string, optional): Hotplug features (network, disk, usb, memory, cpu)
- `tablet` (boolean, optional): Enable USB tablet
- `localtime` (boolean, optional): Use local time for RTC
- `freeze` (boolean, optional): Freeze CPU on suspend
- `cores` (integer, optional): CPU cores
- `memory` (integer, optional): Memory in MB
- `sockets` (integer, optional): CPU sockets
- `numa` (boolean, optional): Enable NUMA
- `vcpus` (integer, optional): Virtual CPUs

**CloudInit parameters**:
- `ciuser` (string, optional): CloudInit user
- `cipassword` (string, optional): CloudInit password
- `nameserver` (string, optional): DNS nameserver
- `searchdomain` (string, optional): DNS search domain
- `ipconfig0` to `ipconfig15` (string, optional): IP config (e.g., "ip=192.168.1.100/24,gw=192.168.1.1")
- `sshkeys` (string, optional): SSH public keys (URL-encoded)
- `citype` (string, optional): CloudInit type (nocloud, configdrive2)

**Response**: `null`

**Permissions**: `VM.Config.HWType` on `/vms/{vmid}`

---

### GET /nodes/{node}/qemu/{vmid}/cloudinit/dump - Get CloudInit Config
**Description**: Get automatically generated cloudinit config.

**Parameters**:
- `node` (string, required): Cluster node name
- `vmid` (integer, required): VM ID
- `type` (string, required): Config type (user, network, meta)

**Response**: CloudInit configuration as string

**Permissions**: `VM.Audit` on `/vms/{vmid}`

---

## VM/CT Firewall

### GET /nodes/{node}/qemu/{vmid}/firewall/rules - List VM Firewall Rules
**Description**: List VM firewall rules.

**Parameters**:
- `node` (string, required): Cluster node name
- `vmid` (integer, required): VM ID
- `enable` (boolean, optional): Filter by enabled status

**Response**:
```json
[
  {
    "pos": 0,
    "enable": 1,
    "type": "in",
    "action": "ACCEPT",
    "proto": "tcp",
    "dport": "22",
    "comment": "SSH"
  }
]
```

**Permissions**: `VM.Audit` on `/vms/{vmid}`

---

### POST /nodes/{node}/qemu/{vmid}/firewall/rules - Create Firewall Rule
**Description**: Create VM firewall rule.

**Parameters**:
- `node` (string, required): Cluster node name
- `vmid` (integer, required): VM ID
- `enable` (boolean, optional): Enable rule (default: 1)
- `type` (string, required): Rule type (in, out)
- `action` (string, required): Action (ACCEPT, DROP, REJECT)
- `proto` (string, optional): Protocol (tcp, udp, esp, gre, icmp, igmp, ipencap, ipv4, ipv6)
- `dport` (string, optional): Destination port(s)
- `sport` (string, optional): Source port(s)
- `source` (string, optional): Source IP/CIDR
- `dest` (string, optional): Destination IP/CIDR
- `iface` (string, optional): Interface name
- `log` (string, optional): Log level (emerg, alert, crit, err, warning, notice, info, debug)
- `comment` (string, optional): Rule comment

**Response**: `null`

**Permissions**: `VM.Config.Network` on `/vms/{vmid}`

---

### PUT /nodes/{node}/qemu/{vmid}/firewall/rules/{pos} - Update Firewall Rule
**Description**: Update VM firewall rule.

**Parameters**: Same as POST (all optional except pos in path)

**Response**: `null`

**Permissions**: `VM.Config.Network` on `/vms/{vmid}`

---

### DELETE /nodes/{node}/qemu/{vmid}/firewall/rules/{pos} - Delete Firewall Rule
**Description**: Delete VM firewall rule.

**Parameters**:
- `node` (string, required): Cluster node name
- `vmid` (integer, required): VM ID
- `pos` (integer, required): Rule position

**Response**: `null`

**Permissions**: `VM.Config.Network` on `/vms/{vmid}`

---

### GET /nodes/{node}/qemu/{vmid}/firewall/options - Get VM Firewall Options
**Description**: Get VM firewall options.

**Parameters**:
- `node` (string, required): Cluster node name
- `vmid` (integer, required): VM ID

**Response**:
```json
{
  "enable": 1,
  "dhcp": 0,
  "macfilter": 0,
  "policy_in": "DROP",
  "policy_out": "ACCEPT",
  "log_level_in": "info",
  "log_level_out": "info"
}
```

**Permissions**: `VM.Audit` on `/vms/{vmid}`

---

### PUT /nodes/{node}/qemu/{vmid}/firewall/options - Update VM Firewall Options
**Description**: Update VM firewall options.

**Parameters**:
- `node` (string, required): Cluster node name
- `vmid` (integer, required): VM ID
- `enable` (boolean, optional): Enable firewall
- `dhcp` (boolean, optional): Enable DHCP
- `macfilter` (boolean, optional): Enable MAC filter
- `policy_in` (string, optional): Inbound policy (ACCEPT, DROP, REJECT)
- `policy_out` (string, optional): Outbound policy (ACCEPT, DROP, REJECT)
- `log_level_in` (string, optional): Inbound log level
- `log_level_out` (string, optional): Outbound log level

**Response**: `null`

**Permissions**: `VM.Config.Network` on `/vms/{vmid}`

---

### LXC Container Firewall (Same pattern)
Replace `/nodes/{node}/qemu/{vmid}/firewall/` with `/nodes/{node}/lxc/{vmid}/firewall/`

All endpoints and parameters are identical to QEMU firewall.

---

## Cluster Firewall - Security Groups

### GET /cluster/firewall/groups - List Security Groups
**Description**: List firewall security groups.

**Response**:
```json
[
  {
    "group": "web-servers",
    "comment": "Web server rules"
  }
]
```

**Permissions**: `Sys.Audit` on `/`

---

### POST /cluster/firewall/groups - Create Security Group
**Description**: Create firewall security group.

**Parameters**:
- `group` (string, required): Group name
- `comment` (string, optional): Group description
- `rename` (string, optional): Rename existing group

**Response**: `null`

**Permissions**: `Sys.Modify` on `/`

---

### GET /cluster/firewall/groups/{group} - List Group Rules
**Description**: List rules in security group.

**Parameters**:
- `group` (string, required): Group name

**Response**:
```json
[
  {
    "pos": 0,
    "enable": 1,
    "type": "in",
    "action": "ACCEPT",
    "proto": "tcp",
    "dport": "80"
  }
]
```

**Permissions**: `Sys.Audit` on `/`

---

### POST /cluster/firewall/groups/{group} - Add Rule to Group
**Description**: Add rule to security group.

**Parameters**:
- `group` (string, required): Group name
- `enable` (boolean, optional): Enable rule
- `type` (string, required): Rule type (in, out)
- `action` (string, required): Action (ACCEPT, DROP, REJECT)
- `proto` (string, optional): Protocol
- `dport` (string, optional): Destination port
- `sport` (string, optional): Source port
- `source` (string, optional): Source IP/CIDR
- `dest` (string, optional): Destination IP/CIDR
- `comment` (string, optional): Rule comment

**Response**: `null`

**Permissions**: `Sys.Modify` on `/`

---

### DELETE /cluster/firewall/groups/{group} - Delete Security Group
**Description**: Delete security group.

**Parameters**:
- `group` (string, required): Group name

**Response**: `null`

**Permissions**: `Sys.Modify` on `/`

---

## Cluster Firewall - Aliases

### GET /cluster/firewall/aliases - List Aliases
**Description**: List firewall aliases.

**Response**:
```json
[
  {
    "name": "internal-net",
    "cidr": "192.168.0.0/16",
    "comment": "Internal network"
  }
]
```

**Permissions**: `Sys.Audit` on `/`

---

### POST /cluster/firewall/aliases - Create Alias
**Description**: Create firewall alias.

**Parameters**:
- `name` (string, required): Alias name
- `cidr` (string, required): CIDR notation (e.g., "192.168.0.0/16")
- `comment` (string, optional): Alias description

**Response**: `null`

**Permissions**: `Sys.Modify` on `/`

---

### GET /cluster/firewall/aliases/{name} - Get Alias
**Description**: Get firewall alias details.

**Parameters**:
- `name` (string, required): Alias name

**Response**:
```json
{
  "name": "internal-net",
  "cidr": "192.168.0.0/16",
  "comment": "Internal network"
}
```

**Permissions**: `Sys.Audit` on `/`

---

### PUT /cluster/firewall/aliases/{name} - Update Alias
**Description**: Update firewall alias.

**Parameters**:
- `name` (string, required): Alias name
- `cidr` (string, optional): CIDR notation
- `comment` (string, optional): Alias description
- `rename` (string, optional): Rename alias

**Response**: `null`

**Permissions**: `Sys.Modify` on `/`

---

### DELETE /cluster/firewall/aliases/{name} - Delete Alias
**Description**: Delete firewall alias.

**Parameters**:
- `name` (string, required): Alias name

**Response**: `null`

**Permissions**: `Sys.Modify` on `/`

---

## Authentication

All API requests require authentication via:
- **Cookie**: `PVEAuthCookie=<ticket>`
- **Token**: `Authorization: PVEAPIToken=<userid>!<tokenid>=<secret>`

### Example Request
```bash
curl -X GET "https://your.server:8006/api2/json/storage" \
  -H "Authorization: PVEAPIToken=user@pam!mytoken=secret"
```

---

## Error Responses

All errors return HTTP status codes with JSON body:
```json
{
  "data": null,
  "errors": "Error message"
}
```

Common status codes:
- `200`: Success
- `400`: Bad request (invalid parameters)
- `401`: Unauthorized (authentication failed)
- `403`: Forbidden (insufficient permissions)
- `404`: Not found
- `500`: Server error

---

## References

- **Official API Viewer**: https://pve.proxmox.com/pve-docs/api-viewer/index.html
- **API Documentation**: https://pve.proxmox.com/wiki/Proxmox_VE_API
- **Proxmox VE Docs**: https://pve.proxmox.com/pve-docs/
- **pvesh CLI Tool**: Shell interface for the Proxmox VE API (available on nodes)
