import SparkMD5 from 'spark-md5';

import { AXIOS_BASEURL } from '@/constant';
import { usePiniaCacheStore } from '@/store/cache';
import { getAxiosBaseUrl } from '@/utils/localStorage/app';

// Public web-client protocol constant, not an account/device credential.
const PROTOCOL_KEY = '2bRrbmkgtBBak2hfPlWA4oj9gw9UkP54GtTTWtPF8tw=';
export const OFFICIAL_PROTOCOL_VERSION = '0.615.0';

export function isOfficialService(url = getAxiosBaseUrl() || AXIOS_BASEURL) {
  try {
    const u = new URL(url);
    return (
      ['https:', 'wss:'].includes(u.protocol) &&
      u.hostname === 'desk-api.hsslive.cn'
    );
  } catch {
    return false;
  }
}

export async function officialRequest(
  path: string,
  data: Record<string, unknown> = {}
) {
  const cache = usePiniaCacheStore();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)), (v) =>
    v.toString(16).padStart(2, '0')
  ).join('');
  const timestamp = String(Date.now());
  const signature = SparkMD5.hash(
    JSON.stringify({ data: { data, query: {} }, key: PROTOCOL_KEY }) +
      nonce +
      timestamp
  );
  const response = await fetch(`https://desk-api.hsslive.cn${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Billd-Env': 'windows',
      'X-Billd-App': 'billd_desk',
      'X-Billd-Appver': OFFICIAL_PROTOCOL_VERSION,
      'X-Billd-Nonce': nonce,
      'X-Billd-Timestamp': timestamp,
      'X-Billd-Sign': signature,
      'X-Billd-Deskuseruuid': encodeURIComponent(cache.deskUserUuid),
      'X-Billd-Deskuserpassword': encodeURIComponent(cache.deskUserPassword),
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || result.code !== 200) {
    throw new Error(result.msg || `官方服务请求失败：${response.status}`);
  }
  return result;
}

export async function decryptOfficialRelays(value: {
  encryptedText: string;
  iv: string;
}): Promise<RTCIceServer[]> {
  // The vendor sends session-scoped TURN authorization encrypted with its public
  // web protocol key. Keep decrypted relay credentials in memory only.
  const decode = (s: string) =>
    Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('mvBSdY67xlTuJDikhDD6zylbO0s9WlHa'),
    'AES-CBC',
    false,
    ['decrypt']
  );
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: new TextEncoder().encode(value.iv) },
    key,
    decode(value.encryptedText)
  );
  const servers = JSON.parse(new TextDecoder().decode(clear));
  if (!Array.isArray(servers)) throw new Error('官方中继配置格式错误');
  return servers.map(({ urls, username, credential }) => ({
    urls,
    username,
    credential,
  }));
}
