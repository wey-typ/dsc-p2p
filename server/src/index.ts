import { networkInterfaces } from "node:os";
import { createGameServer } from "./gameServer.js";

const PORT = Number(process.env.PORT ?? 3000);
// Listen on 0.0.0.0 so phones on the LAN can reach us (not just localhost).
const { httpServer } = createGameServer();

httpServer.listen(PORT, "0.0.0.0", () => {
  const { lan, other } = lanAddresses();
  console.log(`\n🌊 Deep Sea Crew server on port ${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  for (const ip of lan) console.log(`   On Wi-Fi: http://${ip}:${PORT}   <- open THIS on phones`);
  if (lan.length === 0 && other.length > 0) {
    console.log("   (No physical Wi-Fi/Ethernet address detected. Other interfaces:)");
    for (const ip of other) console.log(`            http://${ip}:${PORT}`);
  }
  if (other.length > 0 && lan.length > 0) {
    console.log(`   (Ignoring VPN/virtual interfaces: ${other.join(", ")})`);
  }
  console.log("");
});

/**
 * Split IPv4 addresses into real LAN interfaces (en/eth) vs VPN/virtual ones
 * (utun, ipsec, ppp, tun, tap, awdl, llw, bridge, vboxnet, etc.).
 * Phones can only reach the physical LAN address.
 */
function lanAddresses(): { lan: string[]; other: string[] } {
  const lan: string[] = [];
  const other: string[] = [];
  const virtual = /^(utun|ipsec|ppp|tun|tap|awdl|llw|bridge|vboxnet|vmnet|docker|veth)/i;
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      if (virtual.test(name)) other.push(a.address);
      else lan.push(a.address);
    }
  }
  return { lan, other };
}
