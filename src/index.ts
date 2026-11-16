import * as host from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { install } from './pi-adapter/session.ts';

export default function piCompact(pi: ExtensionAPI): void {
  install(host, pi);
}
