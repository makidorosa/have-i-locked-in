import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Have I Locked In?", short_name: "LOCKED IN", description: "A personal academic accountability planner", start_url: "/", display: "standalone", background_color: "#09090b", theme_color: "#a3e635", icons: [{src:"/lockin-icon-192.png",sizes:"192x192",type:"image/png"},{src:"/lockin-icon-512.png",sizes:"512x512",type:"image/png"}] };
}
