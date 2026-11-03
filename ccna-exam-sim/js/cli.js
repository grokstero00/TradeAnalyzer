/*
 * Cisco IOS-like CLI emulator for the practical labs.
 *
 * A lab state is plain JSON (devices, links, terminals), so it can be stored
 * in localStorage and inside exam answers. Everything here is a pure function
 * of that state: createLab(def) -> state, exec(state, device, line) -> output.
 *
 * Supported: routers (physical + 802.1Q subinterfaces), Layer 2 switches
 * (VLANs, access/trunk ports), PCs (ipconfig, ping, arp -a). Ping walks the
 * topology: Layer 2 segments are built from links, VLANs and trunks, and
 * routers forward by longest prefix match over connected and static routes.
 */
(function () {
  'use strict';

  const CCNA = window.CCNA;

  // ---------------------------------------------------------------- addressing

  const toInt = (s) => s.split('.').reduce((a, o) => a * 256 + Number(o), 0);
  const toIp = (n) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');
  const isIp = (s) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split('.').every((o) => Number(o) <= 255);
  const maskStr = (p) => toIp(p === 0 ? 0 : 2 ** 32 - 2 ** (32 - p));
  const netInt = (ipInt, p) => {
    const size = 2 ** (32 - p);
    return Math.floor(ipInt / size) * size;
  };
  const classfulLen = (ipInt) => {
    const f = Math.floor(ipInt / 2 ** 24);
    return f < 128 ? 8 : f < 192 ? 16 : 24;
  };
  function maskLen(m) {
    if (!isIp(m)) return -1;
    const b = toInt(m).toString(2).padStart(32, '0');
    if (!/^1*0*$/.test(b)) return -1;
    return b.indexOf('0') < 0 ? 32 : b.indexOf('0');
  }
  const hex32 = (n) => '0x' + n.toString(16).toUpperCase().padStart(8, '0');

  // ---------------------------------------------------------------- interfaces

  const IF_TYPES = [
    { full: 'GigabitEthernet', short: 'Gi' },
    { full: 'FastEthernet', short: 'Fa' },
    { full: 'Vlan', short: 'Vl' },
  ];

  function ifType(word) {
    const w = word.toLowerCase();
    return IF_TYPES.find((t) => t.full.toLowerCase().startsWith(w)) || null;
  }

  /* "g0/0", "Gi 0/0", "GigabitEthernet0/0.10" -> { base, sub, name } */
  function parseIf(text) {
    const m = /^([a-z]+)\s*(\d+(?:\/\d+)*)(?:\.(\d+))?$/i.exec(String(text).trim());
    if (!m) return null;
    const t = ifType(m[1]);
    if (!t) return null;
    if (t.full === 'Vlan') {
      const v = Number(m[2]);
      if (m[3] != null || !/^\d+$/.test(m[2]) || v < 1 || v > 4094) return null;
      return { base: `Vlan${v}`, sub: null, name: `Vlan${v}`, svi: v };
    }
    if (!m[2].includes('/')) return null;
    const base = t.full + m[2];
    const sub = m[3] != null ? Number(m[3]) : null;
    return { base, sub, name: sub != null ? `${base}.${sub}` : base };
  }

  function shortIf(name) {
    for (const t of IF_TYPES) if (name.startsWith(t.full)) return t.short + name.slice(t.full.length);
    return name;
  }

  /* "f0/1-24" -> ["f0/1", ..., "f0/24"] (lab definitions only) */
  function expandIfs(spec) {
    const m = /^([a-z]+)((?:\d+\/)+)(\d+)-(\d+)$/i.exec(spec);
    if (!m) return [spec];
    const out = [];
    for (let n = Number(m[3]); n <= Number(m[4]); n++) out.push(`${m[1]}${m[2]}${n}`);
    return out;
  }

  /* IOS "interface range" syntax: "f0/5 - 12, g0/1 - 2" */
  function parseRange(text, d) {
    const names = [];
    for (const part of text.split(',')) {
      const m = /^\s*([a-z]+)\s*((?:\d+\/)+)(\d+)(?:\s*-\s*(\d+))?\s*$/i.exec(part);
      if (!m) return null;
      const t = ifType(m[1]);
      if (!t) return null;
      const from = Number(m[3]);
      const to = m[4] != null ? Number(m[4]) : from;
      if (to < from) return null;
      for (let n = from; n <= to; n++) {
        const name = `${t.full}${m[2]}${n}`;
        if (!d.ifaces[name]) return null;
        names.push(name);
      }
    }
    return names;
  }

  function macFor(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const h2 = Math.imul(h ^ 0x5bd1e995, 2654435761) >>> 0;
    const hex = ('0c' + h.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 12);
    return `${hex.slice(0, 4)}.${hex.slice(4, 8)}.${hex.slice(8, 12)}`;
  }

  const XLAT = 'dsfd;kfoA,.iyewrkldJKDHSUBsgvca69834ncxv9873254k;fg87';
  function type7(pw) {
    const seed = Math.floor(Math.random() * 16);
    let out = String(seed).padStart(2, '0');
    for (let i = 0; i < pw.length; i++) {
      out += (pw.charCodeAt(i) ^ XLAT.charCodeAt((seed + i) % XLAT.length)).toString(16).toUpperCase().padStart(2, '0');
    }
    return out;
  }
  function md5Like(pw) {
    const abc = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let h = 7;
    let s = '';
    const salt = Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * 64)]).join('');
    for (let i = 0; i < 22; i++) {
      h = (Math.imul(h ^ pw.charCodeAt(i % pw.length) ^ salt.charCodeAt(i % 4), 2654435761) >>> 0) + i;
      s += abc[h % 64];
    }
    return `$1$${salt}$${s}`;
  }

  function vlanListStr(list) {
    const s = [...new Set(list)].sort((a, b) => a - b);
    const parts = [];
    for (let i = 0; i < s.length; i++) {
      let j = i;
      while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
      parts.push(i === j ? `${s[i]}` : j === i + 1 ? `${s[i]},${s[j]}` : `${s[i]}-${s[j]}`);
      i = j;
    }
    return parts.join(',');
  }

  function parseVlanList(text) {
    const out = [];
    for (const part of text.split(',')) {
      const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
      if (!m) return null;
      const a = Number(m[1]);
      const b = m[2] != null ? Number(m[2]) : a;
      if (a < 1 || b > 4094 || b < a) return null;
      for (let v = a; v <= b; v++) out.push(v);
    }
    return out;
  }

  // ---------------------------------------------------------------- devices

  const DEFAULT_VLANS = { 1: 'default', 1002: 'fddi-default', 1003: 'token-ring-default', 1004: 'fddinet-default', 1005: 'trnet-default' };
  const RESERVED_VLAN = (v) => v === 1 || (v >= 1002 && v <= 1005);

  function newIface(dev, name, kind, opts) {
    const o = opts || {};
    return {
      name,
      parent: null,
      shutdown: kind === 'router',
      ip: null,
      prefix: null,
      desc: '',
      speed: 'auto',
      duplex: 'auto',
      mode: null,
      access: 1,
      encap: 'negotiate',
      allowed: null,
      native: 1,
      dot1q: null,
      nativeTag: false,
      routed: false,
      noneg: false,
      svi: null,
      media: o.media || null,
      oper: o.oper || null,
      counters: o.counters || null,
      mac: macFor(dev + name),
    };
  }

  function newDevice(def) {
    const kind = def.kind || 'router';
    const d = {
      name: def.name,
      kind,
      hostname: def.hostname || def.name,
      hidden: !!def.hidden,
      secret: null,
      secretHash: null,
      password: null,
      password7: null,
      spe: false,
      ifaces: {},
      routes: [],
      vlans: kind === 'switch' ? Object.assign({}, DEFAULT_VLANS) : null,
      mac: [],
      arp: {},
      startup: null,
      encapRequired: !!def.encapRequired,
      l3: !!def.l3,
      ipRouting: false,
      gw: null,
      vtp: Object.assign({ mode: 'server', domain: '', rev: 0, version: 1 }, def.vtp || {}),
      bridgeMac: def.bridgeMac || macFor(def.name + 'bridge'),
      stpPrio: {},
    };
    if (kind === 'pc') {
      d.ip = def.ip || null;
      d.prefix = def.prefix || 24;
      d.gw = def.gw || null;
      d.nicMac = def.mac || macFor(def.name + 'nic');
      return d;
    }
    const opts = def.ifaceOpts || {};
    for (const spec of def.ifaces || []) {
      for (const short of expandIfs(spec)) {
        const p = parseIf(short);
        if (p) d.ifaces[p.name] = newIface(def.name, p.name, kind, opts[short]);
      }
    }
    for (const [short, o] of Object.entries(opts)) {
      const p = parseIf(short);
      if (p && d.ifaces[p.name]) Object.assign(d.ifaces[p.name], { media: o.media || null, oper: o.oper || null, counters: o.counters || null });
    }
    d.mac = (def.macTable || []).map((e) => ({ vlan: e.vlan || 1, mac: e.mac, port: parseIf(e.port).name }));
    return d;
  }

  /* Physical interfaces in definition order, each followed by its subinterfaces. */
  function ifList(d) {
    const all = Object.values(d.ifaces);
    const out = [];
    for (const i of all) {
      if (i.parent) continue;
      out.push(i);
      all.filter((x) => x.parent === i.name).sort((a, b) => a.dot1qSort - b.dot1qSort || a.name.localeCompare(b.name, 'en', { numeric: true })).forEach((x) => out.push(x));
    }
    return out;
  }

  // ---------------------------------------------------------------- topology

  function peerOf(s, dn, ifn) {
    for (const [a, ai, b, bi] of s.links) {
      if (a === dn && ai === ifn) return [b, bi];
      if (b === dn && bi === ifn) return [a, ai];
    }
    return null;
  }

  /* DTP: the administrative mode and what the link actually negotiates. */
  const adminMode = (i) => i.mode || 'dynamic auto';

  function opMode(s, dn, i) {
    if (i.routed) return 'routed';
    const m = adminMode(i);
    if (m === 'access' || m === 'trunk') return m;
    const p = peerOf(s, dn, i.name);
    const pd = p && s.devices[p[0]];
    if (!pd || pd.kind !== 'switch') return 'access';
    const pi = pd.ifaces[p[1]];
    if (!pi || pi.routed || pi.noneg) return 'access';
    const pm = adminMode(pi);
    if (pm === 'trunk' || pm === 'dynamic desirable') return 'trunk';
    if (pm === 'dynamic auto' && m === 'dynamic desirable') return 'trunk';
    return 'access';
  }

  /* Does this switch port forward frames of VLAN v? */
  function carries(s, d, i, v) {
    if (i.svi || i.routed || !physUp(s, d.name, i.name) || d.vlans[v] === undefined) return false;
    return opMode(s, d.name, i) === 'trunk' ? allowedHas(i, v) : i.access === v;
  }

  function sviUp(s, d, i) {
    if (i.shutdown || d.vlans[i.svi] === undefined) return false;
    return Object.values(d.ifaces).some((x) => carries(s, d, x, i.svi));
  }

  function physUp(s, dn, ifn) {
    const d = s.devices[dn];
    if (!d) return false;
    if (d.kind === 'pc') return true;
    const i = d.ifaces[ifn];
    if (!i || i.shutdown) return false;
    const p = peerOf(s, dn, ifn);
    if (!p) return false;
    const pd = s.devices[p[0]];
    if (!pd) return false;
    if (pd.kind === 'pc') return true;
    const pi = pd.ifaces[p[1]];
    return !!pi && !pi.shutdown;
  }

  function ifUp(s, dn, ifn) {
    const d = s.devices[dn];
    const i = d && d.ifaces[ifn];
    if (!i) return false;
    if (i.svi) return sviUp(s, d, i);
    if (i.parent) return !i.shutdown && physUp(s, dn, i.parent);
    return physUp(s, dn, ifn);
  }

  const allowedHas = (i, v) => i.allowed == null || i.allowed.includes(v);

  /* What a link end puts on the wire: untagged segment key and tagged ones per VLAN. */
  function attach(s, dn, ifn) {
    const d = s.devices[dn];
    if (!d) return null;
    if (d.kind === 'pc') return { u: `${dn}|nic`, t: {} };
    if (!physUp(s, dn, ifn)) return null;
    const i = d.ifaces[ifn];
    if (d.kind === 'router' || i.routed) {
      const r = { u: `${dn}|${ifn}`, t: {} };
      for (const x of Object.values(d.ifaces)) {
        if (x.parent === ifn && !x.shutdown && x.dot1q && !x.nativeTag) r.t[x.dot1q] = `${dn}|${x.name}`;
      }
      return r;
    }
    const exists = (v) => d.vlans[v] !== undefined;
    if (opMode(s, dn, i) === 'trunk') {
      const r = { u: exists(i.native) && allowedHas(i, i.native) ? `${dn}|v${i.native}` : null, t: {} };
      for (const v of Object.keys(d.vlans).map(Number)) {
        if (v >= 1002 && v <= 1005) continue;
        if (v !== i.native && allowedHas(i, v)) r.t[v] = `${dn}|v${v}`;
      }
      return r;
    }
    return { u: exists(i.access) ? `${dn}|v${i.access}` : null, t: {} };
  }

  function segments(s) {
    const parent = {};
    const find = (k) => {
      let r = k;
      while (parent[r] !== undefined && parent[r] !== r) r = parent[r];
      return r;
    };
    const union = (a, b) => {
      const x = find(a);
      const y = find(b);
      if (x !== y) parent[x] = y;
    };
    for (const [a, ai, b, bi] of s.links) {
      const A = attach(s, a, ai);
      const B = attach(s, b, bi);
      if (!A || !B) continue;
      if (A.u && B.u) union(A.u, B.u);
      for (const v of Object.keys(A.t)) if (B.t[v]) union(A.t[v], B.t[v]);
    }
    return find;
  }

  function l2Key(d, i) {
    if (i.svi) return `${d.name}|v${i.svi}`;
    if (!i.parent) return `${d.name}|${i.name}`;
    return i.nativeTag ? `${d.name}|${i.parent}` : `${d.name}|${i.name}`;
  }

  function endpoints(s) {
    const eps = [];
    for (const d of Object.values(s.devices)) {
      if (d.kind === 'pc') {
        if (d.ip) eps.push({ dev: d.name, key: `${d.name}|nic`, ip: d.ip, p: d.prefix, mac: d.nicMac, ifn: 'nic' });
        continue;
      }
      if (d.kind !== 'router' && d.kind !== 'switch') continue;
      for (const i of Object.values(d.ifaces)) {
        if (!i.ip || !ifUp(s, d.name, i.name)) continue;
        if (i.parent && !i.dot1q) continue;
        eps.push({ dev: d.name, key: l2Key(d, i), ip: i.ip, p: i.prefix, mac: i.parent ? d.ifaces[i.parent].mac : i.mac, ifn: i.name });
      }
    }
    return eps;
  }

  // ---------------------------------------------------------------- routing

  function bestRoute(rs, ipInt) {
    let b = null;
    for (const r of rs) if (netInt(ipInt, r.p) === r.net && (!b || r.p > b.p)) b = r;
    return b;
  }

  function routeTable(s, d) {
    const rs = [];
    for (const i of ifList(d)) {
      if (!i.ip || !ifUp(s, d.name, i.name) || (i.parent && !i.dot1q)) continue;
      const ipI = toInt(i.ip);
      rs.push({ code: 'C', net: netInt(ipI, i.prefix), p: i.prefix, out: i.name });
      rs.push({ code: 'L', net: ipI, p: 32, out: i.name });
    }
    const conn = rs.filter((r) => r.code === 'C');
    for (const r of d.routes) {
      if (r.iface && !ifUp(s, d.name, r.iface)) continue;
      if (r.nh) {
        const c = bestRoute(conn, toInt(r.nh));
        if (!c && !r.iface) continue;
        rs.push({ code: 'S', net: r.net, p: r.p, nh: r.nh, iface: r.iface, out: r.iface || c.out });
      } else {
        rs.push({ code: 'S', net: r.net, p: r.p, nh: null, iface: r.iface, out: r.iface });
      }
    }
    return rs;
  }

  function owns(s, d, ip) {
    if (d.kind === 'pc') return d.ip === ip;
    return Object.values(d.ifaces).some((i) => i.ip === ip && ifUp(s, d.name, i.name));
  }

  /* Walks a packet from device `from` to `dst`. Learns ARP entries on the way. */
  function forward(s, from, dst, find, eps, srcIp) {
    let cur = from;
    let src = srcIp || null;
    let routers = 0;
    let arpMiss = false;
    for (let hop = 0; hop < 20; hop++) {
      const d = s.devices[cur];
      if (owns(s, d, dst)) return { ok: true, dev: cur, src, routers, arpMiss };
      let nh;
      let egress;
      let egIf;
      let egIp;
      let egMac;
      let exitOnly = false;
      if (d.kind === 'pc') {
        if (!d.ip) return { ok: false };
        const sameNet = netInt(toInt(dst), d.prefix) === netInt(toInt(d.ip), d.prefix);
        if (sameNet) nh = dst;
        else if (d.gw) nh = d.gw;
        else return { ok: false };
        egress = `${cur}|nic`;
        egIf = 'nic';
        egIp = d.ip;
        egMac = d.nicMac;
      } else if (d.kind === 'router' || d.kind === 'switch') {
        if (d.kind === 'switch' && !d.ipRouting && hop > 0) return { ok: false };
        if (hop > 0) routers++;
        let r = bestRoute(routeTable(s, d).filter((x) => x.code !== 'L' && (d.kind === 'router' || d.ipRouting || x.code === 'C')), toInt(dst));
        if (!r && d.kind === 'switch' && !d.ipRouting && d.gw) {
          const c = bestRoute(routeTable(s, d).filter((x) => x.code === 'C'), toInt(d.gw));
          if (c) r = { code: 'S', nh: d.gw, out: c.out };
        }
        if (!r) return { ok: false };
        const ei = d.ifaces[r.out];
        egress = l2Key(d, ei);
        egIf = ei.name;
        egIp = ei.ip;
        egMac = ei.parent ? d.ifaces[ei.parent].mac : ei.mac;
        nh = r.code === 'C' || !r.nh ? dst : r.nh;
        exitOnly = r.code === 'S' && !r.nh;
      } else {
        return { ok: false };
      }
      src = src || egIp;
      const seg = find(egress);
      let tgt = eps.find((e) => e.ip === nh && e.key !== egress && find(e.key) === seg);
      if (!tgt && exitOnly) {
        // Proxy ARP: a router on the segment that has a route to dst answers for it.
        tgt = eps.find((e) => e.key !== egress && find(e.key) === seg && routes(s.devices[e.dev]) &&
          bestRoute(routeTable(s, s.devices[e.dev]).filter((x) => x.code !== 'L'), toInt(dst)));
      }
      if (!tgt) return { ok: false };
      if (!d.arp[nh]) {
        if (hop === 0) arpMiss = true;
        d.arp[nh] = { mac: tgt.mac, ifn: egIf };
      }
      const td = s.devices[tgt.dev];
      if (egIp && !td.arp[egIp]) td.arp[egIp] = { mac: egMac, ifn: tgt.ifn };
      cur = tgt.dev;
    }
    return { ok: false };
  }

  const routes = (d) => d.kind === 'router' || (d.kind === 'switch' && d.ipRouting);

  function ping(s, from, dst) {
    const d = s.devices[from];
    if (owns(s, d, dst)) return { ok: true, arpMiss: false, routers: 0 };
    const find = segments(s);
    const eps = endpoints(s);
    const there = forward(s, from, dst, find, eps);
    if (!there.ok) return { ok: false, arpMiss: there.arpMiss };
    const back = forward(s, there.dev, there.src, find, eps, dst);
    return { ok: back.ok, arpMiss: there.arpMiss, routers: back.routers, destPc: s.devices[there.dev].kind === 'pc' };
  }

  // ---------------------------------------------------------------- show output

  function runBody(d) {
    const L = ['!', 'version 15.2', d.spe ? 'service password-encryption' : 'no service password-encryption', '!', `hostname ${d.hostname}`, '!', 'boot-start-marker', 'boot-end-marker', '!'];
    if (d.secret != null) L.push(`enable secret 5 ${d.secretHash}`);
    if (d.password != null) L.push(d.password7 ? `enable password 7 ${d.password7}` : `enable password ${d.password}`);
    if (d.secret != null || d.password != null) L.push('!');
    L.push('no aaa new-model', '!');
    if (d.ipRouting) L.push('ip routing', '!');
    if (d.vtp && d.vtp.mode === 'transparent') {
      L.push(...(d.vtp.domain ? [`vtp domain ${d.vtp.domain}`] : []), 'vtp mode transparent', '!');
    }
    if (d.kind === 'switch') {
      L.push('spanning-tree mode pvst', 'spanning-tree extend system-id');
      for (const [v, pr] of Object.entries(d.stpPrio)) L.push(`spanning-tree vlan ${v} priority ${pr}`);
      L.push('!');
    }
    for (const i of ifList(d)) {
      L.push(`interface ${i.name}`);
      if (i.desc) L.push(` description ${i.desc}`);
      if (d.kind === 'router') {
        if (i.parent) {
          if (i.dot1q) L.push(` encapsulation dot1Q ${i.dot1q}${i.nativeTag ? ' native' : ''}`);
        }
        L.push(i.ip ? ` ip address ${i.ip} ${maskStr(i.prefix)}` : ' no ip address');
        if (i.shutdown) L.push(' shutdown');
        if (!i.parent) L.push(` duplex ${i.duplex}`, ` speed ${i.speed}`);
      } else if (i.svi || i.routed) {
        if (i.routed) L.push(' no switchport');
        L.push(i.ip ? ` ip address ${i.ip} ${maskStr(i.prefix)}` : ' no ip address');
        if (i.shutdown) L.push(' shutdown');
      } else {
        if (i.encap === 'dot1q') L.push(' switchport trunk encapsulation dot1q');
        if (i.native !== 1) L.push(` switchport trunk native vlan ${i.native}`);
        if (i.allowed != null) L.push(` switchport trunk allowed vlan ${i.allowed.length ? vlanListStr(i.allowed) : 'none'}`);
        if (i.access !== 1) L.push(` switchport access vlan ${i.access}`);
        if (i.mode && i.mode !== 'dynamic auto') L.push(` switchport mode ${i.mode}`);
        if (i.noneg) L.push(' switchport nonegotiate');
        if (i.speed !== 'auto') L.push(` speed ${i.speed}`);
        if (i.duplex !== 'auto') L.push(` duplex ${i.duplex}`);
        if (i.shutdown) L.push(' shutdown');
      }
      L.push('!');
    }
    if (d.kind === 'router') L.push('ip forward-protocol nd', '!', 'no ip http server', '!');
    if (d.gw) L.push(`ip default-gateway ${d.gw}`, '!');
    if (d.routes.length) {
      for (const r of d.routes) L.push(`ip route ${toIp(r.net)} ${maskStr(r.p)}${r.iface ? ' ' + r.iface : ''}${r.nh ? ' ' + r.nh : ''}`);
      L.push('!');
    }
    L.push('line con 0', d.kind === 'router' ? 'line aux 0' : null, 'line vty 0 4', ' login', '!', 'end');
    return L.filter((x) => x != null);
  }

  function showRun(d) {
    const body = runBody(d);
    const bytes = body.join('\n').length + 120;
    return ['Building configuration...', '', `Current configuration : ${bytes} bytes`, ...body];
  }

  function showStartup(d) {
    if (d.startup == null) return ['startup-config is not present'];
    return [`Using ${d.startup.length + 120} out of 262144 bytes`, ...d.startup.split('\n')];
  }

  function ifStatus(s, d, i) {
    if (i.shutdown || (i.parent && d.ifaces[i.parent].shutdown)) return ['administratively down', 'down'];
    return ifUp(s, d.name, i.name) ? ['up', 'up'] : ['down', 'down'];
  }

  function showIpIntBrief(s, d) {
    const L = ['Interface              IP-Address      OK? Method Status                Protocol'];
    for (const i of ifList(d)) {
      const [st, pr] = ifStatus(s, d, i);
      L.push(`${i.name.padEnd(23)}${(i.ip || 'unassigned').padEnd(16)}YES ${(i.ip ? 'manual' : 'unset').padEnd(7)}${st.padEnd(22)}${pr}`);
    }
    return L;
  }

  function showIpRoute(s, d) {
    const rs = routeTable(s, d);
    const L = [
      'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
      '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
      '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
      '       E1 - OSPF external type 1, E2 - OSPF external type 2',
      '       i - IS-IS, su - IS-IS summary, L1 - IS-IS level-1, L2 - IS-IS level-2',
      '       ia - IS-IS inter area, * - candidate default, U - per-user static route',
      '       o - ODR, P - periodic downloaded static route, H - NHRP, l - LISP',
      '       + - replicated route, % - next hop override',
      '',
    ];
    const def = rs.find((r) => r.code === 'S' && r.p === 0);
    L.push(def ? `Gateway of last resort is ${def.nh || '0.0.0.0'} to network 0.0.0.0` : 'Gateway of last resort is not set', '');
    const tail = (r) => (r.code === 'S'
      ? (r.nh ? ` [1/0] via ${r.nh}${r.iface ? ', ' + r.iface : ''}` : ` is directly connected, ${r.iface}`)
      : ` is directly connected, ${r.out}`);
    const code = (r) => r.code + (r.p === 0 ? '*' : '');
    const groups = new Map();
    const top = [];
    for (const r of rs) {
      const cl = classfulLen(r.net);
      if (r.p < cl) {
        top.push({ net: r.net, lines: [`${code(r).padEnd(6)}${toIp(r.net)}/${r.p}${tail(r)}`] });
        continue;
      }
      const key = netInt(r.net, cl);
      if (!groups.has(key)) groups.set(key, { cl, list: [] });
      groups.get(key).list.push(r);
    }
    for (const [key, g] of groups) {
      g.list.sort((a, b) => a.net - b.net || a.p - b.p);
      if (g.list.length === 1 && g.list[0].p === g.cl) {
        const r = g.list[0];
        top.push({ net: key, lines: [`${code(r).padEnd(6)}${toIp(r.net)}/${r.p}${tail(r)}`] });
        continue;
      }
      const masks = new Set(g.list.map((r) => r.p));
      const lines = [];
      if (masks.size === 1) {
        lines.push(`      ${toIp(key)}/${[...masks][0]} is subnetted, ${g.list.length} subnet${g.list.length > 1 ? 's' : ''}`);
        for (const r of g.list) lines.push(`${code(r).padEnd(9)}${toIp(r.net)}${tail(r)}`);
      } else {
        lines.push(`      ${toIp(key)}/${g.cl} is variably subnetted, ${g.list.length} subnets, ${masks.size} masks`);
        for (const r of g.list) lines.push(`${code(r).padEnd(9)}${toIp(r.net)}/${r.p}${tail(r)}`);
      }
      top.push({ net: key, lines });
    }
    top.sort((a, b) => a.net - b.net);
    for (const t of top) L.push(...t.lines);
    return L;
  }

  function operSpeed(i) {
    if (i.speed !== 'auto') return Number(i.speed);
    if (i.oper && i.oper.speed) return i.oper.speed;
    return i.name.startsWith('Fast') ? 100 : 1000;
  }
  function operDuplex(i) {
    if (i.duplex !== 'auto') return i.duplex;
    if (i.oper && i.oper.duplex) return i.oper.duplex;
    return 'full';
  }

  function showIfStatus(s, d) {
    const L = ['', 'Port      Name               Status       Vlan       Duplex  Speed  Type'];
    for (const i of ifList(d).filter((x) => !x.svi)) {
      const up = ifUp(s, d.name, i.name);
      const st = i.shutdown ? 'disabled' : up ? 'connected' : 'notconnect';
      const om = opMode(s, d.name, i);
      const vlan = om === 'routed' ? 'routed' : om === 'trunk' ? 'trunk' : String(i.access);
      const dup = up ? (i.duplex === 'auto' ? 'a-' + operDuplex(i) : i.duplex) : i.duplex;
      const spd = up ? (i.speed === 'auto' ? 'a-' + operSpeed(i) : i.speed) : i.speed;
      const type = i.media || (i.name.startsWith('Fast') ? '10/100BaseTX' : '10/100/1000BaseTX');
      L.push(`${shortIf(i.name).padEnd(10)}${i.desc.slice(0, 18).padEnd(19)}${st.padEnd(13)}${vlan.padEnd(11)}${dup.padEnd(8)}${spd.padEnd(7)}${type}`);
    }
    return L;
  }

  function showIfDesc(s, d) {
    const L = ['Interface                      Status         Protocol Description'];
    for (const i of ifList(d)) {
      const [st, pr] = ifStatus(s, d, i);
      L.push(`${shortIf(i.name).padEnd(31)}${(st === 'administratively down' ? 'admin down' : st).padEnd(15)}${pr.padEnd(9)}${i.desc}`);
    }
    return L;
  }

  function showInterface(s, d, i) {
    const [st, pr] = ifStatus(s, d, i);
    const up = st === 'up';
    const c = Object.assign({ inPk: up ? 1834 : 0, outPk: up ? 1291 : 0, runts: 0, giants: 0, crc: 0, frame: 0, inErr: 0, outErr: 0, coll: 0, late: 0 }, i.counters || {});
    const hw = d.kind === 'router' ? 'iGbE' : i.name.startsWith('Fast') ? 'Fast Ethernet' : 'Gigabit Ethernet';
    const mac = i.parent ? d.ifaces[i.parent].mac : i.mac;
    const L = [`${i.name} is ${st}, line protocol is ${pr}${d.kind === 'switch' && !up && st !== 'administratively down' ? ' (notconnect)' : d.kind === 'switch' && up ? ' (connected)' : ''}`,
      `  Hardware is ${hw}, address is ${mac} (bia ${mac})`];
    if (i.desc) L.push(`  Description: ${i.desc}`);
    if (i.ip) L.push(`  Internet address is ${i.ip}/${i.prefix}`);
    const bw = operSpeed(i) * 1000;
    L.push(`  MTU 1500 bytes, BW ${bw} Kbit/sec, DLY 10 usec,`, '     reliability 255/255, txload 1/255, rxload 1/255');
    if (i.parent) {
      L.push(`  Encapsulation 802.1Q Virtual LAN, Vlan ID  ${i.dot1q || 'none'}.`);
      return L;
    }
    L.push('  Encapsulation ARPA, loopback not set', '  Keepalive set (10 sec)');
    if (up) {
      const dup = operDuplex(i);
      L.push(`  ${dup === 'half' ? 'Half' : 'Full'}-duplex, ${operSpeed(i)}Mb/s, media type is ${i.media || (d.kind === 'router' ? 'RJ45' : '10/100BaseTX')}`);
    } else {
      L.push(`  ${i.duplex === 'auto' ? 'Auto' : i.duplex === 'half' ? 'Half' : 'Full'}-duplex, ${i.speed === 'auto' ? 'Auto-speed' : i.speed + 'Mb/s'}, media type is ${i.media || (d.kind === 'router' ? 'RJ45' : '10/100BaseTX')}`);
    }
    L.push(
      '  input flow-control is off, output flow-control is unsupported',
      '  Last input never, output never, output hang never',
      '  Queueing strategy: fifo',
      '  5 minute input rate 0 bits/sec, 0 packets/sec',
      '  5 minute output rate 0 bits/sec, 0 packets/sec',
      `     ${c.inPk} packets input, ${c.inPk * 74} bytes, 0 no buffer`,
      '     Received 0 broadcasts (0 multicasts)',
      `     ${c.runts} runts, ${c.giants} giants, 0 throttles`,
      `     ${c.inErr} input errors, ${c.crc} CRC, ${c.frame} frame, 0 overrun, 0 ignored`,
      '     0 watchdog, 0 multicast, 0 pause input',
      `     ${c.outPk} packets output, ${c.outPk * 96} bytes, 0 underruns`,
      `     ${c.outErr} output errors, ${c.coll} collisions, 0 interface resets`,
      '     0 unknown protocol drops',
      `     0 babbles, ${c.late} late collision, 0 deferred`,
      '     0 lost carrier, 0 no carrier, 0 pause output',
      '     0 output buffer failures, 0 output buffers swapped out',
    );
    return L;
  }

  function showVlanBrief(s, d) {
    const L = ['', 'VLAN Name                             Status    Ports', '---- -------------------------------- --------- -------------------------------'];
    for (const v of Object.keys(d.vlans).map(Number).sort((a, b) => a - b)) {
      const ports = ifList(d).filter((i) => !i.svi && !i.routed && opMode(s, d.name, i) !== 'trunk' && i.access === v).map((i) => shortIf(i.name));
      const chunks = [];
      for (let k = 0; k < ports.length; k += 4) chunks.push(ports.slice(k, k + 4).join(', '));
      const status = v >= 1002 && v <= 1005 ? 'act/unsup' : 'active';
      L.push(`${String(v).padEnd(5)}${d.vlans[v].padEnd(33)}${status.padEnd(10)}${chunks.join(',\n' + ' '.repeat(48))}`);
    }
    return L.join('\n').split('\n');
  }

  function showIfTrunk(s, d) {
    const trunks = ifList(d).filter((i) => !i.svi && opMode(s, d.name, i) === 'trunk' && ifUp(s, d.name, i.name));
    if (!trunks.length) return [];
    const active = (i) => Object.keys(d.vlans).map(Number).filter((v) => (v < 1002 || v > 1005) && allowedHas(i, v));
    const L = ['', 'Port        Mode             Encapsulation  Status        Native vlan'];
    const modeCol = (i) => ({ trunk: 'on', 'dynamic desirable': 'desirable', 'dynamic auto': 'auto' })[adminMode(i)] || 'on';
    for (const i of trunks) L.push(`${shortIf(i.name).padEnd(12)}${modeCol(i).padEnd(17)}${(i.encap === 'negotiate' ? 'n-802.1q' : '802.1q').padEnd(15)}${'trunking'.padEnd(14)}${i.native}`);
    L.push('', 'Port        Vlans allowed on trunk');
    for (const i of trunks) L.push(`${shortIf(i.name).padEnd(12)}${i.allowed == null ? '1-4094' : i.allowed.length ? vlanListStr(i.allowed) : 'none'}`);
    L.push('', 'Port        Vlans allowed and active in management domain');
    for (const i of trunks) L.push(`${shortIf(i.name).padEnd(12)}${vlanListStr(active(i)) || 'none'}`);
    L.push('', 'Port        Vlans in spanning tree forwarding state and not pruned');
    for (const i of trunks) L.push(`${shortIf(i.name).padEnd(12)}${vlanListStr(active(i)) || 'none'}`);
    return L;
  }

  function showMac(d) {
    const L = ['          Mac Address Table', '-------------------------------------------', '', 'Vlan    Mac Address       Type        Ports', '----    -----------       --------    -----'];
    for (const e of d.mac) L.push(`${String(e.vlan).padStart(4)}    ${e.mac}    DYNAMIC     ${shortIf(e.port)}`);
    L.push(`Total Mac Addresses for this criterion: ${d.mac.length}`);
    return L;
  }

  function showArp(s, d) {
    const rows = [];
    for (const i of ifList(d)) {
      if (i.ip && ifUp(s, d.name, i.name)) rows.push({ ip: i.ip, age: '-', mac: i.parent ? d.ifaces[i.parent].mac : i.mac, ifn: i.name });
    }
    for (const [ip, e] of Object.entries(d.arp)) rows.push({ ip, age: '0', mac: e.mac, ifn: e.ifn });
    rows.sort((a, b) => toInt(a.ip) - toInt(b.ip));
    return ['Protocol  Address          Age (min)  Hardware Addr   Type   Interface',
      ...rows.map((r) => `Internet  ${r.ip.padEnd(17)}${r.age.padStart(9)}   ${r.mac}  ARPA   ${r.ifn}`)];
  }

  function pingLines(s, d, ip) {
    const r = ping(s, d.name, ip);
    const L = ['Type escape sequence to abort.', `Sending 5, 100-byte ICMP Echos to ${ip}, timeout is 2 seconds:`];
    if (!r.ok) {
      L.push('.....', 'Success rate is 0 percent (0/5)');
    } else if (r.arpMiss) {
      L.push('.!!!!', 'Success rate is 80 percent (4/5), round-trip min/avg/max = 1/1/2 ms');
    } else {
      L.push('!!!!!', 'Success rate is 100 percent (5/5), round-trip min/avg/max = 1/1/3 ms');
    }
    return L;
  }

  function showSwitchport(s, d, i) {
    const om = opMode(s, d.name, i);
    const enc = i.encap === 'negotiate' ? (d.encapRequired ? 'negotiate' : 'dot1q') : i.encap;
    return [
      `Name: ${shortIf(i.name)}`,
      `Switchport: ${i.routed ? 'Disabled' : 'Enabled'}`,
      ...(i.routed ? [] : [
        `Administrative Mode: ${i.mode === 'access' ? 'static access' : i.mode === 'trunk' ? 'trunk' : adminMode(i)}`,
        `Operational Mode: ${!physUp(s, d.name, i.name) ? 'down' : om === 'trunk' ? 'trunk' : 'static access'}`,
        `Administrative Trunking Encapsulation: ${enc}`,
        `Operational Trunking Encapsulation: ${om === 'trunk' ? 'dot1q' : 'native'}`,
        `Negotiation of Trunking: ${i.noneg ? 'Off' : 'On'}`,
        `Access Mode VLAN: ${i.access} (${d.vlans[i.access] || 'Inactive'})`,
        `Trunking Native Mode VLAN: ${i.native} (${d.vlans[i.native] || 'Inactive'})`,
        'Administrative Native VLAN tagging: enabled',
        'Voice VLAN: none',
        `Trunking VLANs Enabled: ${i.allowed == null ? 'ALL' : i.allowed.length ? vlanListStr(i.allowed) : 'NONE'}`,
        'Pruning VLANs Enabled: 2-1001',
      ]),
    ];
  }

  function showVtp(d) {
    const v = d.vtp;
    const count = Object.keys(d.vlans).length;
    return [
      'VTP Version capable             : 1 to 3',
      `VTP version running             : ${v.version}`,
      `VTP Domain Name                 : ${v.domain}`,
      'VTP Pruning Mode                : Disabled',
      'VTP Traps Generation            : Disabled',
      `Device ID                       : ${d.bridgeMac}`,
      'Configuration last modified by 0.0.0.0 at 3-1-93 00:12:39',
      '',
      'Feature VLAN:',
      '--------------',
      `VTP Operating Mode                : ${v.mode[0].toUpperCase() + v.mode.slice(1)}`,
      'Maximum VLANs supported locally   : 1005',
      `Number of existing VLANs          : ${count}`,
      `Configuration Revision            : ${v.rev}`,
    ];
  }

  /*
   * VTP: servers and clients in one domain copy the VLAN database with the
   * highest revision across trunks. Transparent switches relay but never apply.
   * A switch with no domain adopts the first domain it hears.
   */
  function vtpSync(s) {
    const sws = Object.values(s.devices).filter((d) => d.kind === 'switch');
    if (sws.length < 2) return;
    const nbrs = (d) => {
      const out = [];
      for (const i of Object.values(d.ifaces)) {
        if (i.svi || !physUp(s, d.name, i.name) || opMode(s, d.name, i) !== 'trunk') continue;
        const p = peerOf(s, d.name, i.name);
        const pd = p && s.devices[p[0]];
        if (pd && pd.kind === 'switch' && opMode(s, pd.name, pd.ifaces[p[1]]) === 'trunk') out.push(pd);
      }
      return out;
    };
    for (let round = 0; round < 10; round++) {
      let changed = false;
      for (const src of sws) {
        if (src.vtp.mode === 'transparent' || !src.vtp.domain) continue;
        const seen = new Set([src.name]);
        const queue = [src];
        while (queue.length) {
          const cur = queue.shift();
          for (const n of nbrs(cur)) {
            if (seen.has(n.name)) continue;
            seen.add(n.name);
            if (n.vtp.mode === 'transparent') {
              queue.push(n);
              continue;
            }
            if (!n.vtp.domain) {
              n.vtp.domain = src.vtp.domain;
              changed = true;
            }
            if (n.vtp.domain !== src.vtp.domain) continue;
            queue.push(n);
            if (src.vtp.rev > n.vtp.rev) {
              const keep = {};
              for (const [v, name] of Object.entries(n.vlans)) if (Number(v) > 1005) keep[v] = name;
              n.vlans = Object.assign({}, src.vlans, keep);
              n.vtp.rev = src.vtp.rev;
              changed = true;
            }
          }
        }
      }
      if (!changed) break;
    }
  }

  // --- Spanning Tree (802.1D / PVST+): election, roles and states per VLAN

  const stpCost = (i) => ({ 10: 100, 100: 19, 1000: 4, 10000: 2 })[operSpeed(i)] || 4;
  const portNum = (d, i) => ifList(d).filter((x) => !x.svi && !x.parent).indexOf(i) + 1;
  const bidOf = (d, v) => ({ prio: (d.stpPrio[v] != null ? d.stpPrio[v] : 32768) + v, mac: d.bridgeMac });
  const cmpBid = (a, b) => a.prio - b.prio || (a.mac < b.mac ? -1 : a.mac > b.mac ? 1 : 0);

  function computeStp(s, v) {
    const sws = Object.values(s.devices).filter((d) => d.kind === 'switch' && d.vlans[v] !== undefined);
    const ports = {};
    const links = [];
    for (const d of sws) {
      ports[d.name] = {};
      for (const i of ifList(d)) if (carries(s, d, i, v)) ports[d.name][i.name] = { cost: stpCost(i), pid: portNum(d, i) };
    }
    for (const [a, ai, b, bi] of s.links) {
      if (ports[a] && ports[a][ai] && ports[b] && ports[b][bi]) links.push([a, ai, b, bi]);
    }
    if (!sws.length) return null;
    const bid = {};
    for (const d of sws) bid[d.name] = bidOf(d, v);
    const root = sws.slice().sort((x, y) => cmpBid(bid[x.name], bid[y.name]))[0].name;
    // Root path cost with tie-breaks: cost, neighbor bridge ID, neighbor port ID, own port ID.
    const best = { [root]: { cost: 0 } };
    const better = (x, y) => !y || x.cost < y.cost || (x.cost === y.cost && (cmpBid(x.nb, y.nb) < 0 ||
      (cmpBid(x.nb, y.nb) === 0 && (x.npid < y.npid || (x.npid === y.npid && x.pid < y.pid)))));
    for (let k = 0; k < sws.length + 1; k++) {
      for (const [a, ai, b, bi] of links) {
        for (const [x, xi, y, yi] of [[a, ai, b, bi], [b, bi, a, ai]]) {
          if (!best[x] || y === root) continue;
          const cand = { cost: best[x].cost + ports[y][yi].cost, nb: bid[x], npid: ports[x][xi].pid, pid: ports[y][yi].pid, port: yi };
          if (better(cand, best[y])) best[y] = cand;
        }
      }
    }
    const res = { root, bid, best, ports };
    for (const d of sws) for (const n of Object.keys(ports[d.name])) Object.assign(ports[d.name][n], { role: 'Desg', state: 'FWD' });
    for (const [a, ai, b, bi] of links) {
      if (!best[a] || !best[b]) continue;
      const sideA = { cost: best[a].cost, b: bid[a], pid: ports[a][ai].pid };
      const sideB = { cost: best[b].cost, b: bid[b], pid: ports[b][bi].pid };
      const aWins = sideA.cost < sideB.cost || (sideA.cost === sideB.cost && (cmpBid(sideA.b, sideB.b) < 0 || (cmpBid(sideA.b, sideB.b) === 0 && sideA.pid < sideB.pid)));
      const [lx, lxi] = aWins ? [b, bi] : [a, ai];
      const lp = ports[lx][lxi];
      if (best[lx].port === lxi) Object.assign(lp, { role: 'Root', state: 'FWD' });
      else Object.assign(lp, { role: 'Altn', state: 'BLK' });
    }
    for (const d of sws) if (d.name !== root && best[d.name]) Object.assign(ports[d.name][best[d.name].port], { role: 'Root', state: 'FWD' });
    return res;
  }

  function showStp(s, d, v) {
    if (d.vlans[v] === undefined) return [];
    const r = computeStp(s, v);
    if (!r || !Object.keys(r.ports[d.name]).length) return [];
    const me = r.bid[d.name];
    const rb = r.bid[r.root];
    const isRoot = r.root === d.name;
    const b = r.best[d.name];
    const L = [`VLAN${String(v).padStart(4, '0')}`, '  Spanning tree enabled protocol ieee',
      `  Root ID    Priority    ${rb.prio}`, `             Address     ${rb.mac}`];
    if (isRoot) L.push('             This bridge is the root');
    else if (b) {
      const ri = d.ifaces[b.port];
      L.push(`             Cost        ${b.cost}`, `             Port        ${portNum(d, ri)} (${ri.name})`);
    }
    L.push('             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec', '',
      `  Bridge ID  Priority    ${me.prio}  (priority ${me.prio - v} sys-id-ext ${v})`,
      `             Address     ${d.bridgeMac}`,
      '             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec',
      '             Aging Time  300 sec', '',
      'Interface           Role Sts Cost      Prio.Nbr Type',
      '------------------- ---- --- --------- -------- --------------------------------');
    for (const i of ifList(d)) {
      const pt = r.ports[d.name][i.name];
      if (!pt) continue;
      L.push(`${shortIf(i.name).padEnd(20)}${pt.role} ${pt.state} ${String(pt.cost).padEnd(10)}${('128.' + pt.pid).padEnd(9)}P2p`);
    }
    return L;
  }

  // ---------------------------------------------------------------- command table

  const PH = {
    '<ip>': isIp,
    '<mask>': isIp,
    '<word>': () => true,
    '<vlan>': (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 4094,
    '<vlanlist>': (v) => /^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(v),
  };
  const PH_HELP = { '<ip>': 'A.B.C.D', '<mask>': 'A.B.C.D', '<word>': 'WORD', '<vlan>': '<1-4094>', '<vlanlist>': 'WORD', '<rest>': 'LINE' };
  const HELP = {
    clear: 'Reset functions', configure: 'Enter configuration mode', copy: 'Copy from one file to another',
    disable: 'Turn off privileged commands', enable: 'Turn on privileged commands', end: 'Exit from configure mode',
    exit: 'Exit from the EXEC', ping: 'Send echo messages', show: 'Show running system information',
    write: 'Write running configuration to memory', hostname: 'Set system\'s network name',
    interface: 'Select an interface to configure', ip: 'Global IP configuration subcommands', no: 'Negate a command or set its defaults',
    service: 'Modify use of network based services', vlan: 'Vlan commands', do: 'To run exec commands in config mode',
    description: 'Interface specific description', shutdown: 'Shutdown the selected interface', speed: 'Configure speed operation.',
    duplex: 'Configure duplex operation.', switchport: 'Set switching mode characteristics', encapsulation: 'Set encapsulation type for an interface',
    name: 'Ascii name of the VLAN',
  };

  const SPECS = [];
  /* modes: U user, P privileged, G global, I interface, R range, S subinterface, V vlan; kinds: r router, s switch */
  function cmd(modes, kinds, syntax, run) {
    SPECS.push({ modes, kinds, toks: syntax.split(' '), run });
  }

  const IF_MODES = 'IR';

  // --- EXEC
  cmd('U', 'rs', 'enable', (c) => {
    if (c.d.secret != null || c.d.password != null) c.t.pending = { tries: 0 };
    else c.t.mode = 'P';
  });
  cmd('P', 'rs', 'enable', () => {});
  cmd('P', 'rs', 'disable', (c) => { c.t.mode = 'U'; });
  cmd('UP', 'rs', 'exit', (c) => { c.t.mode = 'U'; c.out('', `${c.d.hostname} con0 is now available`, '', 'Press RETURN to get started.', ''); });
  cmd('P', 'rs', 'configure terminal', (c) => { c.t.mode = 'G'; c.out('Enter configuration commands, one per line.  End with CNTL/Z.'); });
  cmd('UP', 'rs', 'ping <ip>', (c, [ip]) => c.out(...pingLines(c.s, c.d, ip)));
  cmd('UP', 'rs', 'show ip interface brief', (c) => c.out(...showIpIntBrief(c.s, c.d)));
  cmd('UP', 'rs', 'show interfaces status', (c) => {
    if (c.d.kind !== 'switch') return c.invalid(2);
    c.out(...showIfStatus(c.s, c.d));
  });
  cmd('UP', 's', 'show interfaces trunk', (c) => c.out(...showIfTrunk(c.s, c.d)));
  cmd('UP', 'rs', 'show interfaces description', (c) => c.out(...showIfDesc(c.s, c.d)));
  cmd('UP', 'rs', 'show interfaces', (c) => ifList(c.d).forEach((i) => c.out(...showInterface(c.s, c.d, i))));
  cmd('UP', 'rs', 'show interfaces <rest>', (c, [x]) => {
    const sw = /\s+(switchport|sw\w*)$/i.exec(x);
    const p = parseIf(sw ? x.slice(0, sw.index) : x);
    const i = p && c.d.ifaces[p.name];
    if (!i) return c.invalid(2);
    if (sw) {
      if (c.d.kind !== 'switch' || i.svi) return c.invalid(3);
      return c.out(...showSwitchport(c.s, c.d, i));
    }
    c.out(...showInterface(c.s, c.d, i));
  });
  cmd('UP', 'rs', 'show ip route', (c) => {
    if (c.d.kind === 'switch' && !c.d.ipRouting) {
      return c.out(`Default gateway is ${c.d.gw || 'not set'}`, '', 'Host               Gateway           Last Use    Total Uses  Interface', 'ICMP redirect cache is empty');
    }
    c.out(...showIpRoute(c.s, c.d));
  });
  cmd('UP', 's', 'show vtp status', (c) => c.out(...showVtp(c.d)));
  cmd('UP', 's', 'show spanning-tree', (c) => {
    const vs = Object.keys(c.d.vlans).map(Number).filter((v) => v < 1002 || v > 1005);
    for (const v of vs) {
      const o = showStp(c.s, c.d, v);
      if (o.length) c.out(...o, '');
    }
  });
  cmd('UP', 's', 'show spanning-tree vlan <vlan>', (c, [v]) => {
    const o = showStp(c.s, c.d, Number(v));
    if (!o.length) return c.out(`Spanning tree instance(s) for vlan ${v} does not exist.`);
    c.out(...o);
  });
  cmd('UP', 's', 'show arp', (c) => c.out(...showArp(c.s, c.d)));
  cmd('UP', 's', 'show vlan brief', (c) => c.out(...showVlanBrief(c.s, c.d)));
  cmd('UP', 's', 'show vlan', (c) => c.out(...showVlanBrief(c.s, c.d)));
  cmd('UP', 's', 'show mac address-table', (c) => c.out(...showMac(c.d)));
  cmd('UP', 'r', 'show arp', (c) => c.out(...showArp(c.s, c.d)));
  cmd('UP', 'r', 'show ip arp', (c) => c.out(...showArp(c.s, c.d)));
  cmd('P', 'rs', 'show running-config', (c) => c.out(...showRun(c.d)));
  cmd('P', 'rs', 'show startup-config', (c) => c.out(...showStartup(c.d)));
  const save = (c) => { c.d.startup = runBody(c.d).join('\n'); c.out('Building configuration...', '[OK]'); };
  cmd('P', 'rs', 'write', save);
  cmd('P', 'rs', 'write memory', save);
  cmd('P', 'rs', 'copy running-config startup-config', (c) => { c.out('Destination filename [startup-config]? '); save(c); });
  cmd('P', 's', 'clear mac address-table dynamic', (c) => { c.d.mac = []; });
  cmd('P', 's', 'clear mac address-table dynamic address <word>', (c, [m]) => {
    const want = m.toLowerCase().replace(/[^0-9a-f]/g, '');
    c.d.mac = c.d.mac.filter((e) => e.mac.replace(/\./g, '') !== want);
  });
  cmd('P', 's', 'clear mac address-table dynamic interface <rest>', (c, [x]) => {
    const p = parseIf(x);
    if (!p || !c.d.ifaces[p.name]) return c.invalid(4);
    c.d.mac = c.d.mac.filter((e) => e.port !== p.name);
  });
  cmd('P', 'r', 'clear arp-cache', (c) => { c.d.arp = {}; });

  // --- global configuration
  cmd('GIRSV', 'rs', 'end', (c) => { c.t.mode = 'P'; c.out(`%SYS-5-CONFIG_I: Configured from console by console`); });
  cmd('G', 'rs', 'exit', (c) => { c.t.mode = 'P'; });
  cmd('IRSV', 'rs', 'exit', (c) => { c.t.mode = 'G'; });
  cmd('GIRSV', 'rs', 'do <rest>', (c, [rest]) => c.sub('P', rest));
  cmd('G', 'rs', 'hostname <word>', (c, [h]) => { c.d.hostname = h; });
  cmd('G', 'rs', 'enable secret <rest>', (c, [pw]) => {
    if (/^[05]\s/.test(pw)) return c.out('ERROR: The secret you entered is not a valid encrypted secret.');
    c.d.secret = pw;
    c.d.secretHash = md5Like(pw);
  });
  cmd('G', 'rs', 'enable password <rest>', (c, [pw]) => {
    if (c.d.secret != null && pw === c.d.secret) {
      c.out('The enable password you have chosen is the same as your enable secret.', 'This is not recommended.  Re-enter the enable password.');
    }
    c.d.password = pw;
    c.d.password7 = c.d.spe ? type7(pw) : null;
  });
  cmd('G', 'rs', 'no enable secret', (c) => { c.d.secret = null; c.d.secretHash = null; });
  cmd('G', 'rs', 'no enable password', (c) => { c.d.password = null; c.d.password7 = null; });
  cmd('G', 'rs', 'service password-encryption', (c) => {
    c.d.spe = true;
    if (c.d.password != null && !c.d.password7) c.d.password7 = type7(c.d.password);
  });
  cmd('G', 'rs', 'no service password-encryption', (c) => { c.d.spe = false; });
  cmd('GIRSV', 'rs', 'interface range <rest>', (c, [x]) => {
    const list = parseRange(x, c.d);
    if (!list) return c.invalid(2);
    c.t.mode = 'R';
    c.t.sel = list;
  });
  cmd('GIRSV', 'rs', 'interface <rest>', (c, [x]) => {
    const p = parseIf(x);
    if (p && p.svi && c.d.kind === 'switch') {
      if (!c.d.ifaces[p.name]) {
        const i = newIface(c.d.name, p.name, 'router');
        i.svi = p.svi;
        c.d.ifaces[p.name] = i;
      }
      c.t.mode = 'I';
      c.t.sel = [p.name];
      return;
    }
    if (!p || p.svi || !c.d.ifaces[p.base]) return c.invalid(1);
    if (p.sub != null) {
      if (c.d.kind !== 'router' || p.sub === 0) return c.invalid(1);
      if (!c.d.ifaces[p.name]) {
        const i = newIface(c.d.name, p.name, 'router');
        i.parent = p.base;
        i.shutdown = false;
        i.dot1qSort = p.sub;
        c.d.ifaces[p.name] = i;
      }
      c.t.mode = 'S';
    } else {
      c.t.mode = 'I';
    }
    c.t.sel = [p.name];
  });
  const l3 = (c) => c.d.kind === 'router' || c.d.l3;
  cmd('G', 'rs', 'ip route <ip> <mask> <rest>', (c, [net, mask, rest]) => (l3(c) ? addRoute(c, net, mask, rest) : c.invalid(1)));
  cmd('G', 'rs', 'no ip route <ip> <mask> <rest>', (c, [net, mask, rest]) => (l3(c) ? delRoute(c, net, mask, rest) : c.invalid(2)));
  cmd('G', 'rs', 'no ip route <ip> <mask>', (c, [net, mask]) => (l3(c) ? delRoute(c, net, mask, null) : c.invalid(2)));
  cmd('G', 's', 'ip routing', (c) => { if (!c.d.l3) return c.invalid(1); c.d.ipRouting = true; });
  cmd('G', 's', 'no ip routing', (c) => { if (!c.d.l3) return c.invalid(2); c.d.ipRouting = false; });
  cmd('G', 's', 'ip default-gateway <ip>', (c, [ip]) => { c.d.gw = ip; });
  cmd('G', 's', 'no ip default-gateway', (c) => { c.d.gw = null; });
  cmd('G', 's', 'vtp mode <word>', (c, [m]) => {
    const mode = ['server', 'client', 'transparent'].find((x) => x.startsWith(m.toLowerCase()));
    if (!mode) return c.invalid(2);
    if (mode !== c.d.vtp.mode && (mode === 'transparent' || c.d.vtp.mode === 'transparent')) c.d.vtp.rev = 0;
    c.d.vtp.mode = mode;
    c.out(`Setting device to VTP ${mode.toUpperCase()} mode for VLANS.`);
  });
  cmd('G', 's', 'vtp domain <word>', (c, [n]) => {
    if (c.d.vtp.domain === n) return c.out(`Domain name already set to ${n}.`);
    c.out(`Changing VTP domain name from ${c.d.vtp.domain || 'NULL'} to ${n}`);
    c.d.vtp.domain = n;
    c.d.vtp.rev = 0;
  });
  cmd('G', 's', 'vtp version <word>', (c, [v]) => {
    if (!['1', '2', '3'].includes(v)) return c.invalid(2);
    if (v === '3' && !c.d.vtp.domain) return c.out('Cannot set the version to 3 because domain name is not configured');
    c.d.vtp.version = Number(v);
  });
  cmd('G', 's', 'spanning-tree vlan <vlanlist> priority <word>', (c, [list, pr]) => {
    const vs = parseVlanList(list);
    const n = Number(pr);
    if (!vs || !/^\d+$/.test(pr) || n > 61440) return c.invalid(4);
    if (n % 4096) {
      return c.out('% Bridge Priority must be in increments of 4096.', '% Allowed values are:',
        '  0     4096  8192  12288 16384 20480 24576 28672', '  32768 36864 40960 45056 49152 53248 57344 61440');
    }
    for (const v of vs) c.d.stpPrio[v] = n;
  });
  cmd('G', 's', 'no spanning-tree vlan <vlanlist> priority', (c, [list]) => {
    for (const v of parseVlanList(list) || []) delete c.d.stpPrio[v];
  });
  const VTP_CLIENT = 'VTP VLAN configuration not allowed when device is in CLIENT mode.';
  const bump = (d) => { if (d.vtp.mode === 'server') d.vtp.rev++; };
  cmd('GIRSV', 's', 'vlan <vlanlist>', (c, [list]) => {
    const vs = parseVlanList(list);
    if (!vs) return c.invalid(1);
    if (c.d.vtp.mode === 'client' && vs.some((v) => c.d.vlans[v] === undefined)) return c.out(VTP_CLIENT);
    for (const v of vs) {
      if (c.d.vlans[v] === undefined) {
        c.d.vlans[v] = `VLAN${String(v).padStart(4, '0')}`;
        bump(c.d);
      }
    }
    c.t.mode = 'V';
    c.t.vlans = vs;
  });
  cmd('G', 's', 'no vlan <vlanlist>', (c, [list]) => {
    const vs = parseVlanList(list);
    if (!vs) return c.invalid(2);
    if (c.d.vtp.mode === 'client') return c.out(VTP_CLIENT);
    for (const v of vs) {
      if (RESERVED_VLAN(v)) c.out(`%Default VLAN ${v} may not be deleted.`);
      else if (c.d.vlans[v] !== undefined) {
        delete c.d.vlans[v];
        bump(c.d);
      }
    }
  });
  cmd('V', 's', 'name <word>', (c, [n]) => {
    for (const v of c.t.vlans) {
      if (RESERVED_VLAN(v)) c.out(`Default VLAN ${v} may not have its name changed.`);
      else if (c.d.vtp.mode === 'client') c.out(VTP_CLIENT);
      else if (c.d.vlans[v] !== n) {
        c.d.vlans[v] = n;
        bump(c.d);
      }
    }
  });

  function addRoute(c, net, mask, rest) {
    const p = maskLen(mask);
    if (p < 0) return c.invalid(3);
    if (netInt(toInt(net), p) !== toInt(net)) return c.out('%Inconsistent address and mask');
    const parts = rest.trim().split(/\s+/);
    let iface = null;
    let nh = null;
    if (isIp(parts[0])) {
      if (parts.length > 1) return c.invalid(5);
      nh = parts[0];
    } else {
      const ip = parseIf(parts[0]);
      if (!ip || !c.d.ifaces[ip.name]) return c.invalid(4);
      iface = ip.name;
      if (parts.length > 2 || (parts[1] && !isIp(parts[1]))) return c.invalid(5);
      nh = parts[1] || null;
    }
    if (nh && Object.values(c.d.ifaces).some((i) => i.ip === nh)) return c.out('%Invalid next hop address (it\'s this router)');
    const route = { net: toInt(net), p, nh, iface };
    if (!c.d.routes.some((r) => r.net === route.net && r.p === p && r.nh === nh && r.iface === iface)) c.d.routes.push(route);
  }

  function delRoute(c, net, mask, rest) {
    const p = maskLen(mask);
    if (p < 0) return c.invalid(4);
    const n = toInt(net);
    const before = c.d.routes.length;
    c.d.routes = c.d.routes.filter((r) => {
      if (r.net !== n || r.p !== p) return true;
      if (!rest) return false;
      const parts = rest.trim().split(/\s+/);
      const want = parts.map((x) => (isIp(x) ? x : (parseIf(x) || {}).name));
      return !(want.includes(r.nh) || want.includes(r.iface));
    });
    if (before === c.d.routes.length) c.out('%No matching route to delete');
  }

  // --- interface configuration (applies to every selected interface)
  const each = (c, fn) => c.t.sel.forEach((n) => fn(c.d.ifaces[n]));

  function setShutdown(c, down) {
    each(c, (i) => {
      const wasUp = ifUp(c.s, c.d.name, i.name);
      i.shutdown = down;
      const nowUp = ifUp(c.s, c.d.name, i.name);
      if (down && !i.parent) {
        c.out(`%LINK-5-CHANGED: Interface ${i.name}, changed state to administratively down`);
        if (wasUp) c.out(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${i.name}, changed state to down`);
      } else if (!down && nowUp && !wasUp && !i.parent) {
        c.out(`%LINK-5-CHANGED: Interface ${i.name}, changed state to up`, `%LINEPROTO-5-UPDOWN: Line protocol on Interface ${i.name}, changed state to up`);
      }
    });
  }

  cmd('IRS', 'rs', 'shutdown', (c) => setShutdown(c, true));
  cmd('IRS', 'rs', 'no shutdown', (c) => setShutdown(c, false));
  cmd('IRS', 'rs', 'description <rest>', (c, [txt]) => each(c, (i) => { i.desc = txt; }));
  cmd('IRS', 'rs', 'no description', (c) => each(c, (i) => { i.desc = ''; }));
  cmd(IF_MODES, 'rs', 'speed <word>', (c, [v]) => {
    const ok = ['10', '100', '1000', 'auto'];
    if (!ok.includes(v.toLowerCase())) return c.invalid(1);
    each(c, (i) => { i.speed = v.toLowerCase(); });
  });
  cmd(IF_MODES, 'rs', 'no speed', (c) => each(c, (i) => { i.speed = 'auto'; }));
  cmd(IF_MODES, 'rs', 'duplex <word>', (c, [v]) => {
    const w = ['full', 'half', 'auto'].find((x) => x.startsWith(v.toLowerCase()));
    if (!w) return c.invalid(1);
    each(c, (i) => { i.duplex = w; });
  });
  cmd(IF_MODES, 'rs', 'no duplex', (c) => each(c, (i) => { i.duplex = 'auto'; }));

  function setIp(c, ip, mask) {
    const p = maskLen(mask);
    if (p < 0) return c.out(`Bad mask ${hex32(toInt(mask))} for address ${ip}`);
    const i = c.d.ifaces[c.t.sel[0]];
    if (c.d.kind === 'switch' && !i.svi && !i.routed) return c.invalid(0);
    if (i.parent && !i.dot1q) {
      return c.out('% Configuring IP routing on a LAN subinterface is only allowed if that', 'subinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q,', 'or ISL vLAN.', '');
    }
    const ipI = toInt(ip);
    if (p < 31) {
      const n = netInt(ipI, p);
      if (ipI === n || ipI === n + 2 ** (32 - p) - 1) return c.out(`Bad mask /${p} for address ${ip}`);
    }
    for (const o of Object.values(c.d.ifaces)) {
      if (o === i || !o.ip) continue;
      const q = Math.min(p, o.prefix);
      if (netInt(ipI, q) === netInt(toInt(o.ip), q)) {
        return c.out(`% ${toIp(netInt(ipI, p))} overlaps with ${o.name}`);
      }
    }
    if (p === 31) c.out(`% Warning: use /31 mask on non point-to-point interface cautiously`);
    i.ip = ip;
    i.prefix = p;
  }

  cmd('IS', 'rs', 'ip address <ip> <mask>', (c, [ip, mask]) => setIp(c, ip, mask));
  cmd('IS', 'rs', 'no ip address', (c) => each(c, (i) => { i.ip = null; i.prefix = null; }));
  const l2Only = (c) => c.t.sel.some((n) => c.d.ifaces[n].svi);
  cmd(IF_MODES, 's', 'no switchport', (c) => {
    if (!c.d.l3 || l2Only(c)) return c.invalid(1);
    each(c, (i) => { i.routed = true; });
  });
  cmd(IF_MODES, 's', 'switchport', (c) => {
    if (l2Only(c)) return c.invalid(0);
    each(c, (i) => { i.routed = false; i.ip = null; i.prefix = null; });
  });
  cmd('S', 'r', 'encapsulation dot1q <vlan>', (c, [v]) => each(c, (i) => { i.dot1q = Number(v); i.nativeTag = false; }));
  cmd('S', 'r', 'encapsulation dot1q <vlan> native', (c, [v]) => each(c, (i) => { i.dot1q = Number(v); i.nativeTag = true; }));

  const portOnly = (c) => c.t.sel.some((n) => c.d.ifaces[n].svi || c.d.ifaces[n].routed);
  cmd(IF_MODES, 's', 'switchport mode dynamic <word>', (c, [m]) => {
    const mode = ['auto', 'desirable'].find((x) => x.startsWith(m.toLowerCase()));
    if (!mode || portOnly(c)) return c.invalid(3);
    if (c.t.sel.some((n) => c.d.ifaces[n].noneg)) {
      return c.out('Command rejected: Conflict between \'nonegotiate\' and \'dynamic\' status.');
    }
    each(c, (i) => { i.mode = `dynamic ${mode}`; });
  });
  cmd(IF_MODES, 's', 'switchport mode <word>', (c, [m]) => {
    const mode = ['access', 'trunk'].find((x) => x.startsWith(m.toLowerCase()));
    if (!mode || portOnly(c)) return c.invalid(2);
    if (mode === 'trunk' && c.d.encapRequired && c.t.sel.some((n) => c.d.ifaces[n].encap !== 'dot1q')) {
      return c.out('Command rejected: An interface whose trunk encapsulation is "Auto" can not be configured to "trunk" mode.');
    }
    each(c, (i) => { i.mode = mode; });
  });
  cmd(IF_MODES, 's', 'no switchport mode', (c) => each(c, (i) => { i.mode = null; }));
  cmd(IF_MODES, 's', 'switchport nonegotiate', (c) => {
    if (portOnly(c)) return c.invalid(1);
    if (c.t.sel.some((n) => adminMode(c.d.ifaces[n]).startsWith('dynamic'))) {
      return c.out('Command rejected: Conflict between \'nonegotiate\' and \'dynamic\' status.');
    }
    each(c, (i) => { i.noneg = true; });
  });
  cmd(IF_MODES, 's', 'no switchport nonegotiate', (c) => each(c, (i) => { i.noneg = false; }));
  cmd(IF_MODES, 's', 'switchport access vlan <vlan>', (c, [v]) => {
    const n = Number(v);
    if (c.d.vlans[n] === undefined) {
      if (c.d.vtp.mode === 'client') {
        c.out('% Access VLAN does not exist. Creating vlan ' + n, VTP_CLIENT);
      } else {
        c.out('% Access VLAN does not exist. Creating vlan ' + n);
        c.d.vlans[n] = `VLAN${String(n).padStart(4, '0')}`;
        bump(c.d);
      }
    }
    each(c, (i) => { i.access = n; });
  });
  cmd(IF_MODES, 's', 'no switchport access vlan', (c) => each(c, (i) => { i.access = 1; }));
  cmd(IF_MODES, 's', 'switchport trunk encapsulation <word>', (c, [e]) => {
    if (!c.d.encapRequired) return c.invalid(2);
    const enc = ['dot1q', 'isl', 'negotiate'].find((x) => x.startsWith(e.toLowerCase()));
    if (!enc) return c.invalid(3);
    each(c, (i) => { i.encap = enc; });
  });
  cmd(IF_MODES, 's', 'switchport trunk native vlan <vlan>', (c, [v]) => each(c, (i) => { i.native = Number(v); }));
  cmd(IF_MODES, 's', 'no switchport trunk native vlan', (c) => each(c, (i) => { i.native = 1; }));
  cmd(IF_MODES, 's', 'switchport trunk allowed vlan <rest>', (c, [rest]) => {
    const parts = rest.trim().split(/\s+/);
    const all = () => Array.from({ length: 4094 }, (_, k) => k + 1);
    const op = parts[0].toLowerCase();
    if (parts.length === 1 && 'all'.startsWith(op) && op.length > 1) return each(c, (i) => { i.allowed = null; });
    if (parts.length === 1 && 'none'.startsWith(op) && op.length > 1) return each(c, (i) => { i.allowed = []; });
    const word = ['add', 'remove', 'except'].find((x) => x.startsWith(op) && op.length > 0 && !/^\d/.test(op));
    const list = parseVlanList(word ? parts[1] || '' : parts[0]);
    if (!list || parts.length > (word ? 2 : 1)) return c.invalid(4);
    each(c, (i) => {
      const cur = i.allowed == null ? all() : i.allowed;
      if (word === 'add') i.allowed = [...new Set([...cur, ...list])].sort((a, b) => a - b);
      else if (word === 'remove') i.allowed = cur.filter((v) => !list.includes(v));
      else if (word === 'except') i.allowed = all().filter((v) => !list.includes(v));
      else i.allowed = list.slice().sort((a, b) => a - b);
      if (i.allowed.length === 4094) i.allowed = null;
    });
  });
  cmd(IF_MODES, 's', 'no switchport trunk allowed vlan', (c) => each(c, (i) => { i.allowed = null; }));

  // ---------------------------------------------------------------- parser

  function tokenize(line) {
    const toks = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(line))) toks.push({ v: m[0], i: m.index });
    return toks;
  }

  function specsFor(mode, kind) {
    const k = kind === 'router' ? 'r' : 's';
    return SPECS.filter((sp) => sp.modes.includes(mode) && sp.kinds.includes(k));
  }

  function match(mode, kind, toks, line) {
    let cands = specsFor(mode, kind).map((sp) => ({ sp, args: [], done: false }));
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i].v.toLowerCase();
      const live = cands.filter((c) => !c.done && c.sp.toks[i] !== undefined);
      const lits = new Set();
      for (const c of live) {
        const tk = c.sp.toks[i];
        if (tk[0] !== '<' && tk.startsWith(w)) lits.add(tk);
      }
      let chosen = null;
      if (lits.has(w)) chosen = w;
      else if (lits.size === 1) chosen = [...lits][0];
      else if (lits.size > 1) return { error: 'ambiguous' };
      const next = cands.filter((c) => c.done);
      for (const c of live) {
        const tk = c.sp.toks[i];
        if (tk[0] !== '<') {
          if (tk === chosen) next.push(c);
        } else if (!chosen) {
          if (tk === '<rest>') next.push({ sp: c.sp, args: [...c.args, line.slice(toks[i].i).trim()], done: true });
          else if (PH[tk](toks[i].v)) next.push({ sp: c.sp, args: [...c.args, toks[i].v], done: false });
        }
      }
      if (!next.length) return { error: 'invalid', at: i };
      cands = next;
    }
    const full = cands.find((c) => c.done || c.sp.toks.length === toks.length);
    return full || { error: 'incomplete' };
  }

  const PROMPTS = { U: '>', P: '#', G: '(config)#', I: '(config-if)#', R: '(config-if-range)#', S: '(config-subif)#', V: '(config-vlan)#' };

  function prompt(s, name) {
    const d = s.devices[name];
    const t = s.term[name];
    if (d.kind === 'pc') return 'C:\\>';
    if (t.pending) return 'Password: ';
    return d.hostname + PROMPTS[t.mode];
  }

  /* "show ... | include X" style output filters. */
  const PIPE = /\s\|\s*(\S+)\s+(.+)$/;
  const FILTERS = ['include', 'exclude', 'begin', 'section'];

  function runLine(s, name, mode, line, out, caretBase) {
    const pipe = PIPE.exec(line);
    if (pipe && /^\s*(do\s+)?sh/i.test(line)) {
      const f = FILTERS.find((x) => x.startsWith(pipe[1].toLowerCase()));
      if (!f) return out.push(' '.repeat(caretBase + pipe.index + 3) + '^', "% Invalid input detected at '^' marker.", '');
      const buf = [];
      runLine(s, name, mode, line.slice(0, pipe.index), buf, caretBase);
      let re;
      try {
        re = new RegExp(pipe[2].trim(), 'i');
      } catch (e) {
        re = { test: (x) => x.toLowerCase().includes(pipe[2].trim().toLowerCase()) };
      }
      if (f === 'include') out.push(...buf.filter((x) => re.test(x)));
      else if (f === 'exclude') out.push(...buf.filter((x) => !re.test(x)));
      else if (f === 'begin') {
        const k = buf.findIndex((x) => re.test(x));
        if (k >= 0) out.push(...buf.slice(k));
      } else {
        let on = false;
        for (const x of buf) {
          if (!/^\s/.test(x)) on = re.test(x);
          if (on) out.push(x);
        }
      }
      return;
    }
    const d = s.devices[name];
    const t = s.term[name];
    const toks = tokenize(line);
    if (!toks.length) return;
    let r = match(mode, d.kind, toks, line);
    if (r.error && 'IRSV'.includes(mode)) {
      const g = match('G', d.kind, toks, line);
      if (!g.error) {
        t.mode = 'G';
        r = g;
      }
    }
    const invalidAt = (at) => {
      const tok = toks[Math.min(at, toks.length - 1)];
      out.push(' '.repeat(caretBase + tok.i) + '^', "% Invalid input detected at '^' marker.", '');
    };
    if (r.error === 'ambiguous') return out.push(`% Ambiguous command:  "${line.trim()}"`);
    if (r.error === 'incomplete') return out.push('% Incomplete command.', '');
    if (r.error === 'invalid') {
      if (r.at === 0 && (mode === 'U' || mode === 'P') && toks.length === 1) {
        return out.push(`Translating "${toks[0].v}"...domain server (255.255.255.255)`, '% Unknown command or computer name, or unable to find computer address');
      }
      return invalidAt(r.at);
    }
    const ctx = {
      s,
      d,
      t,
      out: (...lines) => out.push(...lines),
      invalid: invalidAt,
      sub: (m, rest) => runLine(s, name, m, rest, out, caretBase + line.indexOf(rest)),
    };
    r.sp.run(ctx, r.args);
  }

  function pcExec(s, d, line, out) {
    const toks = tokenize(line);
    if (!toks.length) return;
    const w = toks[0].v.toLowerCase();
    if (w === 'ipconfig') {
      out.push('', 'Ethernet adapter Ethernet0:', '',
        `   IPv4 Address. . . . . . . . . . . : ${d.ip || ''}`,
        `   Subnet Mask . . . . . . . . . . . : ${d.ip ? maskStr(d.prefix) : ''}`,
        `   Default Gateway . . . . . . . . . : ${d.gw || ''}`, '');
    } else if (w === 'ping' && toks[1] && isIp(toks[1].v)) {
      const ip = toks[1].v;
      const r = ping(s, d.name, ip);
      out.push('', `Pinging ${ip} with 32 bytes of data:`);
      const ttl = r.destPc ? 128 - r.routers : 255 - r.routers;
      for (let k = 0; k < 4; k++) {
        if (!r.ok || (k === 0 && r.arpMiss)) out.push('Request timed out.');
        else out.push(`Reply from ${ip}: bytes=32 time=1ms TTL=${ttl}`);
      }
      const rec = r.ok ? (r.arpMiss ? 3 : 4) : 0;
      out.push('', `Ping statistics for ${ip}:`, `    Packets: Sent = 4, Received = ${rec}, Lost = ${4 - rec} (${(4 - rec) * 25}% loss),`, '');
    } else if (w === 'arp' && toks[1] && toks[1].v === '-a') {
      const rows = Object.entries(d.arp);
      if (!rows.length) out.push('No ARP Entries Found.');
      else {
        out.push('', `Interface: ${d.ip} --- 0x1`, '  Internet Address      Physical Address      Type');
        for (const [ip, e] of rows) {
          const m = e.mac.replace(/\./g, '').match(/../g).join('-');
          out.push(`  ${ip.padEnd(22)}${m.padEnd(22)}dynamic`);
        }
        out.push('');
      }
    } else if (w === 'help' || w === '?') {
      out.push('Available commands: ipconfig, ping <ip>, arp -a');
    } else {
      out.push(`'${toks[0].v}' is not recognized as an internal or external command.`, 'Available commands: ipconfig, ping <ip>, arp -a');
    }
  }

  /* Fills fields added in later versions, so lab states saved by older versions keep working. */
  function upgrade(s) {
    if (s.v === 2) return s;
    for (const d of Object.values(s.devices)) {
      if (d.kind === 'pc') continue;
      if (!d.vtp) d.vtp = { mode: 'server', domain: '', rev: 0, version: 1 };
      if (!d.stpPrio) d.stpPrio = {};
      if (!d.bridgeMac) d.bridgeMac = macFor(d.name + 'bridge');
      if (d.ipRouting == null) d.ipRouting = false;
      if (d.gw === undefined) d.gw = null;
      for (const i of Object.values(d.ifaces)) {
        if (i.routed == null) i.routed = false;
        if (i.noneg == null) i.noneg = false;
        if (i.svi === undefined) i.svi = null;
      }
    }
    s.v = 2;
    return s;
  }

  function exec(s, name, line) {
    upgrade(s);
    const d = s.devices[name];
    const t = s.term[name];
    const out = [];
    s.touched = true;
    if (t.pending) {
      out.push('Password: ');
      const ok = d.secret != null ? line === d.secret : line === d.password;
      if (ok) {
        t.pending = null;
        t.mode = 'P';
      } else if (++t.pending.tries >= 3) {
        t.pending = null;
        out.push('% Bad secrets', '');
      }
      push(t, out);
      return out;
    }
    const p = prompt(s, name);
    out.push(p + line);
    if (d.kind === 'pc') pcExec(s, d, line, out);
    else runLine(s, name, t.mode, line, out, p.length);
    vtpSync(s);
    if (line.trim()) {
      t.hist.push(line);
      if (t.hist.length > 50) t.hist.shift();
    }
    push(t, out);
    return out;
  }

  function push(t, out) {
    t.lines.push(...out);
    if (t.lines.length > 600) t.lines.splice(0, t.lines.length - 600);
  }

  function candidates(s, name, body) {
    const d = s.devices[name];
    const t = s.term[name];
    if (d.kind === 'pc') return { names: ['ipconfig', 'ping', 'arp'], cr: false, partial: '' };
    const partial = body.length > 0 && !/\s$/.test(body);
    const toks = tokenize(body);
    const fixed = partial ? toks.slice(0, -1) : toks;
    const part = partial ? toks[toks.length - 1].v.toLowerCase() : '';
    const names = new Map();
    let cr = false;
    {
      for (const sp of specsFor(t.mode, d.kind)) {
        let ok = true;
        for (let i = 0; i < fixed.length; i++) {
          const x = sp.toks[i];
          if (x === undefined || x === '<rest>') { ok = false; break; }
          if (x[0] === '<' ? !PH[x](fixed[i].v) : !x.startsWith(fixed[i].v.toLowerCase())) { ok = false; break; }
        }
        if (!ok) continue;
        const nx = sp.toks[fixed.length];
        if (nx === undefined) {
          if (!partial) cr = true;
          continue;
        }
        if (partial) {
          if (nx[0] !== '<' && nx.startsWith(part)) names.set(nx, HELP[nx] || '');
        } else {
          names.set(nx[0] === '<' ? PH_HELP[nx] : nx, nx[0] === '<' ? '' : HELP[nx] || '');
        }
      }
    }
    return { names: [...names.keys()].sort(), help: names, cr, partial: part };
  }

  /* IOS-style "?" help. `line` is the input without the question mark. */
  function help(s, name, line) {
    upgrade(s);
    const out = [prompt(s, name) + line + '?'];
    const c = candidates(s, name, line);
    if (s.devices[name].kind === 'pc') out.push('ipconfig   ping <ip>   arp -a');
    else if (!c.names.length && !c.cr) out.push('% Unrecognized command');
    else if (c.partial) out.push(c.names.join('  '));
    else {
      for (const n of c.names) out.push(`  ${n.padEnd(20)}${c.help.get(n) || ''}`);
      if (c.cr) out.push('  <cr>');
    }
    out.push('');
    push(s.term[name], out);
    return out;
  }

  /* Tab completion of the last word. */
  function complete(s, name, line) {
    if (!line || /\s$/.test(line)) return line;
    const c = candidates(s, name, line);
    if (c.names.length !== 1) return line;
    const toks = tokenize(line);
    return line.slice(0, toks[toks.length - 1].i) + c.names[0] + ' ';
  }

  // ---------------------------------------------------------------- labs

  function newTerm(mode, lines) {
    return { mode, sel: [], vlans: [], pending: null, lines: lines || [], hist: [] };
  }

  function createLab(def) {
    const s = { lab: def.id, v: 2, devices: {}, links: [], term: {}, active: null, answers: [], touched: false };
    for (const dd of def.devices) s.devices[dd.name] = newDevice(dd);
    for (const [a, ai, b, bi] of def.links || []) {
      const na = s.devices[a].kind === 'pc' ? 'nic' : parseIf(ai).name;
      const nb = s.devices[b].kind === 'pc' ? 'nic' : parseIf(bi).name;
      s.links.push([a, na, b, nb]);
    }
    for (const dd of def.devices) {
      if (dd.kind === 'pc') continue;
      s.term[dd.name] = newTerm('G');
      for (const line of dd.setup || []) {
        const out = [];
        runLine(s, dd.name, s.term[dd.name].mode, line, out, 0);
        if (out.some((x) => /^% (?!Warning)|^%[A-Z]|^\s*\^|Bad mask|rejected/.test(x) && !/^%(LINK|LINEPROTO|SYS)-/.test(x))) console.warn(`Lab ${def.id} ${dd.name} setup: ${line}`, out);
      }
      if (dd.saved) s.devices[dd.name].startup = runBody(s.devices[dd.name]).join('\n');
    }
    vtpSync(s);
    for (const dd of def.devices) {
      const d = s.devices[dd.name];
      const banner = d.kind === 'pc'
        ? [`${d.name} — командная строка ПК. Команды: ipconfig, ping <ip>, arp -a`, '']
        : ['', `${d.hostname} con0 is now available`, '', 'Press RETURN to get started.', ''];
      s.term[dd.name] = newTerm(d.kind === 'pc' ? 'U' : dd.start || def.start || 'U', banner);
    }
    s.active = (def.devices.find((x) => !x.hidden) || def.devices[0]).name;
    return s;
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function normAnswer(v) {
    const t = String(v == null ? '' : v).trim().replace(/%$/, '');
    const p = parseIf(t);
    if (p) return p.name.toLowerCase();
    const hex = t.replace(/[.:-]/g, '');
    if (/^[0-9a-f]{12}$/i.test(hex) && (hex === t || /^([0-9a-f]{4}\.){2}[0-9a-f]{4}$|^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(t))) return hex.toLowerCase();
    return t.toLowerCase().replace(/[\s,]+/g, '');
  }

  /* Read-only helpers for task checks. Pings run on a copy so they do not change ARP tables. */
  function helpers(s) {
    const dev = (n) => s.devices[n];
    const ifc = (n, x) => {
      const p = parseIf(x);
      return p ? dev(n).ifaces[p.name] || null : null;
    };
    return {
      dev,
      ifc,
      ip: (n, x) => {
        const i = ifc(n, x);
        return i && i.ip ? `${i.ip}/${i.prefix}` : null;
      },
      up: (n, x) => {
        const p = parseIf(x);
        return !!p && ifUp(s, n, p.name);
      },
      ping: (n, ip) => ping(clone(s), n, ip).ok,
      route: (n, prefix) => {
        const [net, p] = prefix.split('/');
        return routeTable(s, dev(n)).find((r) => r.code === 'S' && r.net === toInt(net) && r.p === Number(p)) || null;
      },
      saved: (n) => dev(n).startup != null && dev(n).startup === runBody(dev(n)).join('\n'),
      vlan: (n, v) => (dev(n).vlans || {})[v],
      op: (n, x) => opMode(s, n, ifc(n, x)),
      stp: (v) => computeStp(s, v),
      mac: (n, x) => (x ? ifc(n, x).mac : dev(n).nicMac),
      answer: (k) => s.answers[k] || '',
    };
  }

  function checkLab(def, s) {
    upgrade(s);
    const H = helpers(s);
    const tasks = (def.tasks || []).map((t) => {
      try {
        return !!t.check(H);
      } catch (e) {
        return false;
      }
    });
    const questions = (def.questions || []).map((q, k) => {
      let acc;
      try {
        acc = typeof q.answer === 'function' ? q.answer(H) : q.answer;
      } catch (e) {
        acc = [];
      }
      const given = normAnswer(s.answers[k]);
      return !!given && [].concat(acc).some((a) => normAnswer(a) === given);
    });
    const all = tasks.every(Boolean) && questions.every(Boolean);
    return { tasks, questions, all };
  }

  function questionAnswers(def, s) {
    const H = helpers(s);
    return (def.questions || []).map((q) => {
      try {
        return [].concat(typeof q.answer === 'function' ? q.answer(H) : q.answer);
      } catch (e) {
        return [];
      }
    });
  }

  CCNA.cli = { createLab, exec, prompt, help, complete, checkLab, questionAnswers, parseIf, shortIf, ping };
})();
