import { Suspense, use, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const NameInner = ({ address, namePromise }: { address: string, namePromise: Promise<string> }) => {
  const name = use(namePromise);

  const shortAddress = (address: string) => address.slice(0, 6) + "..." + address.slice(-4);

  return name ? name.replace("@", "") : shortAddress(address);
}

export default function Name({ address, resolveNameServiceNames }: { address: string, resolveNameServiceNames: (address: string) => Promise<string> }) {
  const namePromise = useMemo(() => {
    if (address) {
      return resolveNameServiceNames(address);
    }
    return Promise.resolve("");
  }, [address, resolveNameServiceNames]);
  
  return (
    <Suspense fallback={<Skeleton className="w-16 h-4" />}>
      <NameInner address={address} namePromise={namePromise} />
    </Suspense>
  )
}
