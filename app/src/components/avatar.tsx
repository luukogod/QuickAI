import { cn } from "@/lib/utils";

export default function Avatar({ address }: { address: string }) {
  const colors = [
    "red-500",
    "orange-500",
    "yellow-500",
    "green-500",
    "blue-500",
  ];

  const startColor = parseInt(address.slice(0, 8), 16) % colors.length;
  const endColor = parseInt(address.slice(8, 16), 16) % colors.length;

  const startColorString = `from-${colors[startColor]}`
  const endColorString = `to-${colors[endColor]}`

  return <div className={cn("bg-gradient-to-r", startColorString, endColorString, "w-6 h-6 rounded-full mr-2")} />
}
