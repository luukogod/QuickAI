import Link from "next/link";
import { cn } from "@/lib/utils";
import Name from "@/components/name";
import Avatar from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { MIST_PER_USDC } from "@/lib/constants";
import type { DatasetObject } from "@/lib/types";
import { Download, Eye, FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const stringToHash = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return hash
}

const getGradientClasses = (name: string): [string, string] => {
  const colors = [
    "red-500",
    "orange-500",
    "yellow-500",
    "green-500",
    "blue-500",
  ];
  const hash = stringToHash(name);
  const startColorIndex = Math.abs(hash) % colors.length;
  const endColorIndex = Math.abs(hash >> 8) % colors.length;
  const startColor = `from-${colors[startColorIndex]}`;
  const endColor = `to-${colors[endColorIndex]}`;
  return [startColor, endColor];
}

export function DatasetList({ datasets, currentAddress, resolveNameServiceNames }: { datasets: DatasetObject[], currentAddress?: string, resolveNameServiceNames: (address: string) => Promise<string> }) {
  const getShortModelName = (modelName: string) => {
    return modelName.split("/").pop();
  }

  const hasAccess = (dataset: DatasetObject) => {
    return currentAddress && (currentAddress === dataset.owner || dataset.allowlist.includes(currentAddress));
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
      {datasets.map((dataset) => {
        const userHasAccess = hasAccess(dataset);
        return (
          <Link href={`/dataset/${dataset.id}`} key={dataset.id}>
            <div className="relative group h-full">
              {userHasAccess && (
                <div
                  className={cn(
                    "absolute -inset-0.5 rounded-xl blur-md group-hover:blur-lg transition-all duration-300 bg-gradient-to-r opacity-25",
                    ...getGradientClasses(dataset.name)
                  )}
                />
              )}
              <Card className="h-full hover:shadow-md transition-shadow relative">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{dataset.name}</CardTitle>
                      <CardDescription className="text-sm">
                        <div className="flex items-center space-x-2">
                          <Avatar address={dataset.owner} />
                          <Name address={dataset.owner} resolveNameServiceNames={resolveNameServiceNames} />
                        </div>
                      </CardDescription>
                    </div>
                    <Badge variant={dataset.visibility.inner === 0 ? "secondary" : "outline"}>
                      {dataset.visibility.inner === 0 ? "Public" : "Private"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  <p className="text-sm text-muted-foreground line-clamp-3">{dataset.description}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <Badge variant="outline" className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {dataset.metadata.numRows.toLocaleString()} rows
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      {dataset.hfMetadata.config}/{dataset.hfMetadata.split}
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      {getShortModelName(dataset.modelMetadata.name)}
                    </Badge>
                  </div>
                </CardContent>
                <CardFooter className="pt-2">
                  <div className="flex justify-between items-center w-full text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      <span>{dataset.stats.numDownloads.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      <span>v{dataset.version}</span>
                    </div>
                    {dataset.price > 0 && <div className="font-medium text-foreground">{(dataset.price / MIST_PER_USDC).toFixed(2)} USDC</div>}
                  </div>
                </CardFooter>
              </Card>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
