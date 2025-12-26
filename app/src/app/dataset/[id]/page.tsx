"use client";

import Link from "next/link";
import { toast } from "sonner";
import Name from "@/components/name";
import { notFound } from "next/navigation";
import { DatasetObject } from "@/lib/types";
import { fromHex } from "@mysten/sui/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getBlob, getDataset } from "@/lib/actions";
import { Skeleton } from "@/components/ui/skeleton";
import { Transaction } from "@mysten/sui/transactions";
import DatasetViewer from "@/components/dataset-viewer";
import { EncryptedObject, SealClient } from "@mysten/seal";
import { getAllowlistedKeyServers, SessionKey } from "@mysten/seal";
import { use, useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { MIST_PER_USDC, TESTNET_PACKAGE_ID, TESTNET_USDC_TYPE } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Edit3, AlertCircle, ExternalLink, FileText, Info, Server, Tag, Loader2, Coins } from "lucide-react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient, useSignPersonalMessage } from "@mysten/dapp-kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function DatasetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [features, setFeatures] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBuying, setIsBuying] = useState<boolean>(false);
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [dataset, setDataset] = useState<DatasetObject | null>(null);
  const [isProcessingTx, setIsProcessingTx] = useState<boolean>(false);
  const [editablePrice, setEditablePrice] = useState<number | null>(null);
  const [editableVisibility, setEditableVisibility] = useState<number>(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [decryptedBytes, setDecryptedBytes] = useState<Uint8Array | null>(null);

  const isSuiAddress = (address: string) => {
    return address.startsWith("0x") && address.length === 66
  }

  if (!isSuiAddress(id)) {
    notFound();
  }

  const suiClient = useSuiClient();
  const currentAccount = useCurrentAccount();
  
  const sealClient = useMemo(() => {
    if (!suiClient || !currentAccount) {
      return null;
    }
    return new SealClient({
      suiClient: suiClient as any,
      serverObjectIds: getAllowlistedKeyServers("testnet").map((id, index) => [id, index]),
      verifyKeyServers: false,
    });
  }, [suiClient, currentAccount]);

  const { mutate: signPersonalMessage } = useSignPersonalMessage();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction({
    execute: async ({ bytes, signature }) =>
      suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: { showEffects: true },
      }),
  });

  const fetchDatasetData = useCallback(async () => {
    if (id) {
      try {
        setIsLoading(true);
        const ds = await getDataset(id);
        setDataset(ds);
        const ownerCheck = currentAccount?.address === ds.owner;
        setIsOwner(ownerCheck);
        setHasAccess(ownerCheck || !!(ds?.allowlist.includes(currentAccount?.address || "notasuiaddress")));
        setEditablePrice(ds.price);
        setEditableVisibility(ds.visibility.inner);
        setError(null);
      } catch (err: any) {
        console.error("Failed to fetch dataset metadata:", err);
        setError(`Failed to load dataset: ${err.message}`);
        setDataset(null);
      } finally {
        setIsLoading(false);
      }
    }
  }, [id, currentAccount]);

  useEffect(() => {
    fetchDatasetData();
  }, [fetchDatasetData]);

  useEffect(() => {
    setDecryptedBytes(null);
    setParsedData(null);
    setFeatures([]);
    setError(null);
  }, [dataset?.blobId, currentAccount?.address]);

  const decryptBlob = async (data: Uint8Array, datasetObj: DatasetObject) => {
    if (!currentAccount || !suiClient || !sealClient || !datasetObj || !datasetObj.blobId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    const tx = new Transaction();
    const encryptedObjectId = EncryptedObject.parse(data).id;

    const sessionKey = new SessionKey({
      address: currentAccount.address,
      packageId: TESTNET_PACKAGE_ID,
      ttlMin: 10,
    });

    signPersonalMessage(
      { message: sessionKey.getPersonalMessage() },
      {
        onSuccess: async (resultSignal: { signature: string }) => {
          try {
            await sessionKey.setPersonalMessageSignature(resultSignal.signature);

            tx.moveCall({
              target: `${TESTNET_PACKAGE_ID}::dataset::seal_approve`,
              arguments: [tx.pure.vector("u8", fromHex(encryptedObjectId)), tx.object(datasetObj.id)],
            });

            const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

            await sealClient.fetchKeys({
              ids: [encryptedObjectId],
              txBytes,
              sessionKey,
              threshold: 1,
            });

            const decrypted = await sealClient.decrypt({
              data,
              sessionKey,
              txBytes,
            });
            setDecryptedBytes(decrypted);
            setHasAccess(true);
          } catch (err: any) {
            setHasAccess(false);
            setDecryptedBytes(null);
          } finally {
            setIsLoading(false);
          }
        },
        onError: (err: any) => {
          setError(`Signing failed: ${err.message}`);
          setDecryptedBytes(null);
          setIsLoading(false);
        },
      }
    );
  };

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!dataset || !dataset.blobId || !currentAccount) {
      setIsLoading(false);
      return;
    }

    if (decryptedBytes || dataset.visibility.inner === 1 || !hasAccess) {
      setIsLoading(false);
      return;
    }

    if (error) {
      return;
    }

    setIsLoading(true);

    getBlob(dataset.blobId)
      .then((blob) => {
        if (blob) {
          decryptBlob(blob, dataset);
        } else {
          throw new Error("Blob data is null or undefined after fetching.");
        }
      })
      .catch((err) => {
        console.error("Failed to get blob:", err);
        setError(`Failed to load blob: ${err.message}`);
        setDecryptedBytes(null);
        setParsedData(null);
        setFeatures([]);
        setIsLoading(false);
      });
  }, [dataset, currentAccount, hasAccess]);

  useEffect(() => {
    if (decryptedBytes) {
      try {
        const stringData = new TextDecoder().decode(decryptedBytes);
        const rawParsedData = JSON.parse(stringData);

        if (rawParsedData && Array.isArray(rawParsedData.features) && Array.isArray(rawParsedData.rows)) {
          const extractedFeatures = rawParsedData.features.map((feature: { name: string }) => feature.name);
          setFeatures(extractedFeatures);

          const formattedForViewer = rawParsedData.rows.map((dataRow: { row_idx: number, row: any, signature: string, response_hash: string }) => ({
            row_idx: dataRow.row_idx,
            row: dataRow.row,
            signature: dataRow.signature,
            response_hash: dataRow.response_hash,
          }));
          setParsedData(formattedForViewer);
        } else {
          console.error("Parsed data is not in the expected format:", rawParsedData);
          setError("Dataset content is not in the expected format.");
          setParsedData(null);
          setFeatures([]);
        }
      } catch (e: any) {
        console.error("Failed to parse decrypted data:", e);
        setError(`Failed to parse dataset contents: ${e.message}`);
        setParsedData(null);
        setFeatures([]);
      } finally {
        setIsLoading(false);
      }
    } else if (currentAccount && dataset && !isLoading && !error) {
    }
  }, [decryptedBytes, currentAccount, dataset, isLoading, error]);

  const handleSaveChanges = async () => {
    if (!dataset || !currentAccount || currentAccount.address !== dataset.owner) return;

    setIsProcessingTx(true);
    setError(null);
    setSuccessMessage(null);

    const tx = new Transaction();
    let changesMade = false;

    if (dataset.visibility.inner !== editableVisibility) {
      tx.moveCall({
        target: `${TESTNET_PACKAGE_ID}::dataset::change_visibility`,
        arguments: [tx.object(dataset.id), tx.pure.u16(editableVisibility)],
      });
      changesMade = true;
    }

    if (dataset.price !== editablePrice) {
      tx.moveCall({
        target: `${TESTNET_PACKAGE_ID}::dataset::change_price`,
        arguments: [tx.object(dataset.id), tx.pure.u64(editablePrice! * MIST_PER_USDC)],
      });
      changesMade = true;
    }

    if (!changesMade) {
      setSuccessMessage("No changes detected.");
      setIsProcessingTx(false);
      setIsEditing(false);
      return;
    }

    signAndExecuteTransaction(
      { transaction: tx },
      {
        onSuccess: (result: any) => {
          console.log("Transaction successful:", result);
          setSuccessMessage("Dataset details updated successfully!");
          setIsEditing(false);
        },
        onError: (err: any) => {
          console.error("Transaction failed:", err);
          setError(`Failed to update dataset: ${err.message}`);
        },
        onSettled: () => {
          setIsProcessingTx(false);
        },
      }
    );
  };

  const getShortModelName = (modelName: string) => {
    return modelName.split("/").pop();
  }

  const handleBuyDataset = async () => {
    if (!dataset || !currentAccount || dataset.price <= 0) return;

    setIsBuying(true);
    setError(null);
    setSuccessMessage(null);

    const { data: coins } = await suiClient.getCoins({
      owner: currentAccount.address,
      coinType: TESTNET_USDC_TYPE,
    });
    
    if (coins.length === 0) {
      toast.error("Generation Failed", { description: "No USDC coins found for the current account." });
      return;
    }

    const tx = new Transaction();
    const [generationCoin] = tx.splitCoins(coins[0].coinObjectId, [dataset.price]);
    
    tx.moveCall({
      target: `${TESTNET_PACKAGE_ID}::dataset::download_dataset`,
      arguments: [
        tx.object(dataset.id),
        generationCoin,
      ],
    });

    signAndExecuteTransaction({ transaction: tx }, {
        onSuccess: () => {
          setSuccessMessage("Successfully purchased access to the dataset! Decryption should start soon.");
          fetchDatasetData();
          setHasAccess(true);
        },
        onError: (err: any) => {
          setSuccessMessage("Successfully purchased access to the dataset! Decryption should start soon.");
          fetchDatasetData();
          setHasAccess(true);
        },
        onSettled: () => {
          setIsBuying(false);
        },
      }
    );
  };

  const handleDownload = () => {
    if (!parsedData || !dataset) return;
    const dataToDownload = parsedData.map(item => item.row);
    const jsonString = JSON.stringify(dataToDownload, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const filename = dataset.name ? `${dataset.name.replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/gi, '')}.json` : `${dataset.id}.json`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  const resolveNameServiceNames = useCallback(async (address: string) => {
    const response = await suiClient.resolveNameServiceNames({
      address,
      format: "at",
    });
    return response.data[0];
  }, [suiClient])

  if (isLoading && !dataset) {
    return <div className="container mx-auto p-4 text-center">Loading dataset metadata...</div>;
  }

  if (error && !dataset) {
    return <div className="container mx-auto p-4 text-center text-red-600"><AlertCircle className="inline mr-2" />{error}</div>;
  }

  if (!dataset) {
    return (
      <div className="container mx-auto p-4 space-y-6 animate-pulse">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex-grow">
            <Skeleton className="h-8 w-3/4 mb-2" />
            <Skeleton className="h-6 w-1/4" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="lg:col-span-1 space-y-6">
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-grow">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl flex items-baseline">
              <Link href={`/user/${dataset.owner}`} className="text-slate-400 dark:text-slate-500 mx-1">
                <Name address={dataset.owner} resolveNameServiceNames={resolveNameServiceNames} />
              </Link>
              <span className="text-slate-400 dark:text-slate-500 mx-1">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{dataset.name}</span>
            </h1>
            <Badge variant={dataset.visibility.inner === 0 ? "outline" : "secondary"}>
              {dataset.visibility.inner === 0 ? "Public" : "Private"}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2 mb-3">
            {dataset.modelMetadata?.name && (
              <Link
                href={`https://huggingface.co/${dataset.modelMetadata.name}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Badge variant="outline" className="text-xs">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  {getShortModelName(dataset.modelMetadata.name)}
                </Badge>
              </Link>
            )}
            {dataset.hfMetadata?.path && (
              <Link
                href={`https://huggingface.co/datasets/${dataset.hfMetadata.path}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Badge variant="outline" className="text-xs">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  {dataset.hfMetadata.path}
                </Badge>
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isOwner && (
            <Dialog open={isEditing} onOpenChange={setIsEditing}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={() => setIsEditing(true)} disabled={isProcessingTx}>
                  <Edit3 size={18} className="mr-2" />
                  Edit Details
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Dataset Details</DialogTitle>
                  <DialogDescription>
                    Modify the dataset's price and visibility.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="editableVisibility">Visibility</Label>
                    <Select
                      value={String(editableVisibility)}
                      onValueChange={(value) => setEditableVisibility(Number(value))}
                    >
                      <SelectTrigger id="editableVisibility">
                        <SelectValue placeholder="Select visibility" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Public (Sellable)</SelectItem>
                        <SelectItem value="1">Private (Not Sellable)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editableVisibility === 0 && (
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="editablePrice">Price (in USDC)</Label>
                      <Input
                        id="editablePrice"
                        type="number"
                        value={editablePrice ? editablePrice : ""}
                        onChange={(e) => setEditablePrice(Number(e.target.value))}
                        min="0"
                      />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                  <Button onClick={handleSaveChanges} disabled={isProcessingTx}>
                    {isProcessingTx ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {currentAccount && !hasAccess && dataset && dataset.price > 0 && dataset.visibility.inner === 0 && (
            <Button
              onClick={handleBuyDataset}
              variant="default"
              title={`Buy Access for ${dataset.price / MIST_PER_USDC} USDC`}
              disabled={isLoading || isProcessingTx || isBuying}
              className="bg-[#6750A4] hover:bg-[#6750A4]/90"
            >
              {isBuying ? (
                <Loader2 size={18} className="mr-2 animate-spin" />
              ) : (
                <Coins size={18} className="mr-2" />
              )}
              {isBuying ? "Processing..." : `Buy for ${dataset.price / MIST_PER_USDC} USDC`}
            </Button>
          )}
          {parsedData && currentAccount && (
             <Button onClick={handleDownload} variant="default" title="Download Decrypted Dataset as JSON" disabled={isLoading || isProcessingTx}>
                <Download size={18} className="mr-2" /> Download
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col gap-6">
            <p className="text-base">{dataset.description || "No description provided."}</p>
          </div>

          {dataset && currentAccount && !isLoading && parsedData && features.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Dataset Content Preview</CardTitle>
                <CardDescription>Decrypted and parsed content from the dataset.</CardDescription>
              </CardHeader>
              <CardContent>
                <DatasetViewer features={features} data={parsedData} />
              </CardContent>
            </Card>
          )}

          {dataset && currentAccount && isLoading && dataset.blobId && !error && (
            <div className="p-4 border rounded-lg shadow bg-blue-100 text-blue-700 flex items-center">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading and decrypting dataset content... Please wait.
            </div>
          )}

          {currentAccount && !isLoading && !parsedData && dataset?.blobId && hasAccess && (
            <div className="p-4 border rounded-lg shadow bg-yellow-100 text-yellow-800 flex items-center">
              <AlertCircle className="mr-2 h-5 w-5" /> 
              Attempting to load dataset content, but no data is available for display. Either you haven't access to the dataset or this could be due to decryption issues.
            </div>
          )}

          {!currentAccount && dataset && (
            <div className="p-4 border rounded-lg shadow bg-blue-100 text-blue-700 flex items-center">
              <AlertCircle className="mr-2 h-5 w-5" /> Please connect your wallet to attempt decryption and view dataset contents.
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card>
            <CardHeader><CardTitle className="text-lg">Dataset Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">ID</p>
                    <p className="text-sm font-mono break-all">{dataset.id}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Tag className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Walrus Blob ID</p>
                    <p className="text-sm font-mono break-all">{dataset.blobId ?? "N/A"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Server className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Price</p>
                    <p className="text-sm">
                      {dataset.price > 0 
                        ? `${dataset.price / MIST_PER_USDC} USDC` 
                        : "Free"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Rows & Tokens</p>
                    <p className="text-sm">
                      {dataset.metadata.numRows?.toLocaleString() ?? "N/A"} rows, 
                      {" "}{dataset.metadata.numTokens?.toLocaleString() ?? "N/A"} tokens
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Download className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Downloads</p>
                    <p className="text-sm">
                      {dataset.stats.numDownloads?.toLocaleString() ?? "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
