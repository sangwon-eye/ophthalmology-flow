// 서버와 켜기/끄기/상태확인 도구가 함께 쓰는 설정·주소 도우미
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_FILE = path.join(ROOT, '서버설정.txt');

// 서버설정.txt 의 "이름=값" 줄을 읽습니다. # 으로 시작하는 줄은 무시합니다.
// 메모장이 옛 방식(ANSI)으로 저장해도 한글 경로가 깨지지 않게 읽습니다.
export function loadConfig() {
  const out = {};
  let text = '';
  try {
    const buf = fs.readFileSync(CONFIG_FILE);
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (e) {
    if (e.code === 'ENOENT') return out;
    try { text = new TextDecoder('euc-kr').decode(fs.readFileSync(CONFIG_FILE)); } catch { return out; }
  }
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2]) out[m[1].toUpperCase()] = m[2];
  }
  return out;
}

export function configuredPort() {
  return Number(loadConfig().PORT) || Number(process.env.PORT) || 3000;
}

// 다른 컴퓨터가 접속할 주소. WSL·Hyper-V·가상머신이 만든 가상 네트워크 주소는 뒤로 뺍니다.
const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Loopback|Bluetooth|docker/i;
export function lanAddresses() {
  const main = [], virtual = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      (VIRTUAL.test(name) ? virtual : main).push(a.address);
    }
  }
  return { main, virtual };
}
