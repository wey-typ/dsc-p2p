import { networkInterfaces } from "node:os";
import { createGameServer } from "./gameServer.js";

const PORT = Number(process.env.PORT ?? 3000);
const { httpServer } = createGameServer();

httpServer.listen(PORT, () => {
  const ips = lanAddresses();
  console.log(`\n🌊 Deep Sea Crew server on port ${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  for (const ip of ips) console.log(`   On Wi-Fi: http://${ip}:${PORT}  <- open this on phones`);
  console.log("");
});

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address);
    }
  }
  return out;
}
