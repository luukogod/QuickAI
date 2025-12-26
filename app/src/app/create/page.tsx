"use client";

import * as z from "zod";
import { toast } from "sonner";
import { getModels } from "@/lib/actions";
import { useForm } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fromHex, toHex } from "@mysten/sui/utils";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { zodToJsonSchema } from "zod-to-json-schema";
import DatasetInput from "@/components/dataset-input";
import { zodResolver } from "@hookform/resolvers/zod";
import { Transaction } from "@mysten/sui/transactions";
import DatasetViewer from "@/components/dataset-viewer";
import { Loader2, Sparkles, ServerOff } from "lucide-react";
import JsonSchemaInput from "@/components/json-schema-input";
import { useRouter, useSearchParams } from "next/navigation";
import { getAllowlistedKeyServers, SealClient } from "@mysten/seal";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AtomaModel, GenerationConfig, HFDataset, SyntheticDataResultItem } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { generatePromptWithWizard, getRows, generateRow, storeBlob } from "@/app/create/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TESTNET_PACKAGE_ID, TESTNET_SUITHETIC_OBJECT, MIST_PER_USDC, TESTNET_USDC_TYPE } from "@/lib/constants";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const generateSyntheticDataset = async (dataset: HFDataset, generationConfig: GenerationConfig, setProgress: (progress: number) => void) => {
  const output: SyntheticDataResultItem[] = [];

  let offset = 0;
  let totalTokensUsed = 0;
  let rows: any[] = await getRows(dataset, offset, 10);
  offset += 10;
  
  while (totalTokensUsed < generationConfig.maxTokens) {
    if (rows.length === 0) {
      rows = await getRows(dataset, offset, 10);
      offset += 10;
    }

    const row = rows.shift();
    if (!row) {
      break;
    }

    const rowData = row.row[generationConfig.inputFeature];

    const { result, usage, signature, response_hash } = await generateRow(rowData, generationConfig, generationConfig.maxTokens - totalTokensUsed);
    totalTokensUsed += usage.totalTokens;
    setProgress(totalTokensUsed / generationConfig.maxTokens);

    output.push({
      input: rowData,
      data: result,
      usage,
      signature,
      responseHash: response_hash,
    });
  }

  return output;
}

const formSchema = z.object({
  datasetName: z.string().min(3, "Dataset name must be at least 3 characters."),
  modelId: z.string().min(1, "Model is required."),
  maxTokens: z.coerce.number().min(1, "Max tokens must be at least 1."),
  inputFeature: z.string().min(1, "Input feature is required."),
  isStructured: z.boolean(),
  prompt: z.string().includes("{input}"),
  visibility: z.coerce.number().int().min(0).max(1),
  description: z.string().optional(),
  price: z.coerce.number().min(0).optional(),
}).refine(data => {
  if (data.visibility === 0 && (data.price === undefined || data.price < 0)) {
    return false;
  }
  return true;
}, {
  message: "Price must be a non-negative number for public datasets.",
  path: ["price"],
});

function CreateInnerPage() {
  const [data, setData] = useState<any[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [numEpochs, setNumEpochs] = useState<number>(1);
  const [features, setFeatures] = useState<string[]>([]);
  const [models, setModels] = useState<AtomaModel[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isLocking, setIsLocking] = useState<boolean>(false);
  const [wizardPrompt, setWizardPrompt] = useState<string>("");
  const [dataset, setDataset] = useState<HFDataset | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(true);
  const [previewAttempts, setPreviewAttempts] = useState<number>(0);
  const [uploadCompleted, setUploadCompleted] = useState<boolean>(false);
  const [datasetBlobId, setDatasetBlobId] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [isStoringDataset, setIsStoringDataset] = useState<boolean>(false);
  const [jsonSchema, setJsonSchema] = useState<z.ZodObject<any> | null>(null);
  const [datasetObjectId, setDatasetObjectId] = useState<string | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState<boolean>(false);
  const [isPromptGenerating, setIsPromptGenerating] = useState<boolean>(false);
  const [initialJsonSchema, setInitialJsonSchema] = useState<object | null>(null);
  const [wizardPromptGenerated, setWizardPromptGenerated] = useState<boolean>(false);
  const [isDatasetGenerationLoading, setIsDatasetGenerationLoading] = useState<boolean>(false);
  const [syntheticDatasetOutput, setSyntheticDatasetOutput] = useState<SyntheticDataResultItem[]>([]);

  const MAX_PREVIEW_ATTEMPTS = 5;

  const router = useRouter();
  const suiClient = useSuiClient();
  const searchParams = useSearchParams();
  const currentAccount = useCurrentAccount();
  const sealClient = useMemo(() => new SealClient({
    suiClient: suiClient as any,
    serverObjectIds: getAllowlistedKeyServers("testnet").map((id, index) => [id, index]),
    verifyKeyServers: false,
  }), [suiClient]);

  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction({
    execute: async ({ bytes, signature }) =>
      await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
          showRawEffects: true,
          showEffects: true,
        },
      }),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      datasetName: "",
      modelId: "",
      maxTokens: 100,
      inputFeature: "",
      isStructured: false,
      prompt: "",
      visibility: 0,
      description: "",
      price: 0,
    },
    mode: "onChange",
  });

  const previewFeatures = useMemo(() => {
    const inputFeature = form.getValues("inputFeature");
    return inputFeature ? [inputFeature, "generated_output"] : ["generated_output"];
  }, [form.watch("inputFeature")]);

  const selectedModelId = form.watch("modelId");
  const selectedModel = useMemo(() => models.find(m => m.id === selectedModelId) || null, [models, selectedModelId]);

  useEffect(() => {
    const currentMaxTokens = form.getValues("maxTokens");
    if (selectedModel && typeof currentMaxTokens === "number" && currentMaxTokens > selectedModel.max_num_compute_units) {
      form.setValue("maxTokens", selectedModel.max_num_compute_units, { shouldValidate: true });
    }
  }, [selectedModel, form]);

  useEffect(() => {
    const prefillForm = async () => {
      const datasetPath = searchParams.get("datasetPath");
      const datasetConfig = searchParams.get("datasetConfig");
      const datasetSplit = searchParams.get("datasetSplit");

      if (datasetPath && datasetConfig && datasetSplit) {
        try {
          const response = await fetch(`https://datasets-server.huggingface.co/first-rows?dataset=${datasetPath}&config=${datasetConfig}&split=${datasetSplit}`);
          if (response.ok) {
            const data = await response.json();
            const features = data.features.map((feature: any) => feature.name);
            setDataset({
              path: datasetPath,
              config: datasetConfig,
              split: datasetSplit,
              features: features,
            });
          } else {
            toast.error("Failed to load dataset from URL", { description: `Could not fetch details for ${datasetPath}.` });
            console.error("Failed to fetch dataset info for pre-filling", await response.text());
          }
        } catch (error) {
          toast.error("Failed to load dataset from URL", { description: "An error occurred while fetching dataset details."});
          console.error("Error fetching dataset info for pre-filling:", error);
        }
      }

      const datasetName = searchParams.get("datasetName");
      if (datasetName) form.setValue("datasetName", datasetName, { shouldValidate: true });

      const modelId = searchParams.get("modelId");
      if (modelId) {
        form.setValue("modelId", modelId, { shouldValidate: true });
        setModels([{id: modelId, object: "model", created: 0, owned_by: "", task_small_id: 0, price_per_one_million_compute_units: 1, max_num_compute_units: 1000000}]);
      }

      const maxTokens = searchParams.get("maxTokens");
      if (maxTokens) form.setValue("maxTokens", Number(maxTokens), { shouldValidate: true });

      const inputFeature = searchParams.get("inputFeature");
      if (inputFeature) form.setValue("inputFeature", inputFeature, { shouldValidate: true });

      const prompt = searchParams.get("prompt");
      if (prompt) {
        form.setValue("prompt", prompt, { shouldValidate: true });
        setIsWizardOpen(false);
      }

      const visibility = searchParams.get("visibility");
      if (visibility) form.setValue("visibility", Number(visibility), { shouldValidate: true });

      const description = searchParams.get("description");
      if (description) form.setValue("description", description, { shouldValidate: true });

      const price = searchParams.get("price");
      if (price) form.setValue("price", Number(price), { shouldValidate: true });

      const wizardPromptValue = searchParams.get("wizardPrompt");
      if (wizardPromptValue) {
        setWizardPrompt(wizardPromptValue);
        setIsWizardOpen(true);
      }

      const jsonSchema = searchParams.get("jsonSchema");
      if (jsonSchema) {
        // console.log(JSON.parse(jsonSchema));
        setInitialJsonSchema(JSON.parse(jsonSchema));
        form.setValue("isStructured", true, { shouldValidate: true });
      }
    };

    if (searchParams.toString()) {
      prefillForm();
    }
  }, [searchParams, form, setDataset, setWizardPrompt, setIsWizardOpen]);

  const handleTestGeneration = useCallback(async () => {
    if (!dataset) return;
    if (previewAttempts >= MAX_PREVIEW_ATTEMPTS) {
      toast.warning("Preview Limit Reached", { description: "You have reached the maximum number of preview attempts." });
      return;
    }
    
    setIsPreviewLoading(true);
    setPreviewAttempts(prev => prev + 1);
    
    const { modelId, inputFeature, maxTokens, prompt, isStructured } = form.getValues();
    const currentModel = models.find(m => m.id === modelId);

    if (!currentModel) {
      toast.error("Test Generation Failed", { description: "Model not selected for test generation." });
      setIsPreviewLoading(false);
      return;
    }

    try {
      const generationConfig: GenerationConfig = {
        model: currentModel.id,
        inputFeature,
        jsonSchema: isStructured && jsonSchema ? zodToJsonSchema(jsonSchema) : undefined,
        maxTokens,
        prompt
      };
      
      const testSamples = data.slice(0, 3).map((row) => row.row[inputFeature]);

      const outputs: SyntheticDataResultItem[] = [];
      for (const sample of testSamples) {
        const { result, usage, signature, response_hash } = await generateRow(sample, generationConfig, generationConfig.maxTokens);
        outputs.push({
          input: sample,
          data: result,
          usage,
          signature,
          responseHash: response_hash,
        });
      }
      
      const preview = outputs.map((item, index) => ({
        row_idx: index,
        row: {
          [inputFeature]: item.input,
          "generated_output": item.data || "No output generated"
        },
        signature: item.signature,
        response_hash: item.responseHash,
      }));
      
      setPreviewData(preview);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [dataset, previewAttempts, form, models, jsonSchema, data]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!dataset || !currentAccount?.address) {
      toast.error("Generation Failed", { description: "Dataset or current account not available for generation." });
      return;
    }
    const currentModel = models.find(m => m.id === values.modelId);
    if (!currentModel) {
      toast.error("Generation Failed", { description: "Model not found for generation." });
      return;
    }

    const { data: coins } = await suiClient.getCoins({
      owner: currentAccount.address,
      coinType: TESTNET_USDC_TYPE,
    });

    if (coins.length === 0) {
      toast.error("Generation Failed", { description: "No USDC coins found for the current account." });
      return;
    }

    const megaTokens = values.maxTokens / 1_000_000;
    const roundedGenerationSuiAmount = Math.ceil(currentModel.price_per_one_million_compute_units * megaTokens);

    const tx = new Transaction();
    const [generationCoin] = tx.splitCoins(coins[0].coinObjectId, [roundedGenerationSuiAmount]);

    tx.moveCall({
      target: `${TESTNET_PACKAGE_ID}::suithetic::add_to_balance`,
      arguments: [
        tx.object(TESTNET_SUITHETIC_OBJECT),
        generationCoin
      ],
    });
    
    const hfRevision = (dataset as any).revision || "main"; 
    const modelTaskSmallId = 0; 
    const modelNodeSmallId = 0;

    const finalPrice = values.visibility === 1 ? 0 : (values.price || 0) * MIST_PER_USDC;

    const datasetObject = tx.moveCall({
      target: `${TESTNET_PACKAGE_ID}::dataset::mint_dataset`,
      arguments: [
        tx.pure.string(dataset.path),
        tx.pure.string(dataset.config),
        tx.pure.string(dataset.split),
        tx.pure.string(hfRevision),
        tx.pure.u16(values.visibility),
        tx.pure.string(values.datasetName),
        tx.pure.string(values.description || ""),
        tx.pure.u64(finalPrice),
        tx.pure.string(currentModel.id),
        tx.pure.u64(modelTaskSmallId),
        tx.pure.u64(modelNodeSmallId),
        tx.pure.u64(currentModel.price_per_one_million_compute_units),
        tx.pure.u64(currentModel.max_num_compute_units),
      ]
    });

    tx.transferObjects([datasetObject], tx.pure.address(currentAccount.address));

    signAndExecuteTransaction({ transaction: tx }, {
      onSuccess: async (result: any) => {
        const sharedObjects = result.effects?.created?.filter((obj: any) => obj.owner.Shared);
        if (sharedObjects.length > 0) {
          setDatasetObjectId(sharedObjects[0].reference.objectId);
        } else {
          toast.error("Transaction Error", { description: "Failed to get dataset object ID from transaction result." });
          console.error("Failed to get dataset object ID from transaction result:", result);
          return;
        }

        setIsDatasetGenerationLoading(true);
    
        try {
          const generationConfig: GenerationConfig = {
            model: currentModel.id,
            inputFeature: values.inputFeature,
            jsonSchema: values.isStructured && jsonSchema ? zodToJsonSchema(jsonSchema) : undefined,
            maxTokens: values.maxTokens,
            prompt: values.prompt
          };
  
          if (!dataset) {
            toast.error("Dataset Generation Error", { description: "Dataset not selected or invalid." });
            setSyntheticDatasetOutput([]);
            setIsDatasetGenerationLoading(false);
            return;
          }
  
          setSyntheticDatasetOutput([]); 
  
          const outputs = await generateSyntheticDataset(dataset, generationConfig, setProgress);
          setSyntheticDatasetOutput(outputs);
        } catch (error: any) {
          const errorMessage = error.message || "An unknown error occurred on the server.";
          toast.error("Dataset Generation Error", { description: `Client-side error: ${errorMessage}` });
          setSyntheticDatasetOutput([]);
        } finally {
          setIsDatasetGenerationLoading(false);
          setProgress(0);
        }
      },
      onError: (error: any) => {
        toast.error("Transaction Failed", { description: error.message || "An unknown error occurred during the transaction." });
        console.error("Transaction failed:", error);
      }
    });
  };

  const sanitizeDataset = useCallback((datasetToSanitize: SyntheticDataResultItem[]): Uint8Array => {
    const { inputFeature } = form.getValues();
    const rows = datasetToSanitize.map((item, index) => ({
      row_idx: index,
      row: {
        [`${inputFeature || 'input'}`]: item.input,
        "generated_output": item.data
      },
      signature: item.signature,
      response_hash: item.responseHash,
      truncated_cells: []
    }));

    const jsonData = {
      features: [
        { feature_idx: 0, name: inputFeature || 'input', type: { dtype: "string", _type: "Value" } },
        { feature_idx: 1, name: "generated_output", type: { dtype: "string", _type: "Value" } }
      ],
      rows: rows,
      num_rows_total: rows.length,
      num_rows_per_page: 100,
      partial: false
    };

    const jsonString = JSON.stringify(jsonData);
    return new TextEncoder().encode(jsonString);
  }, [form]);

  const encryptBlob = useCallback(async (dataToEncrypt: Uint8Array): Promise<Uint8Array> => {
    const nonce = crypto.getRandomValues(new Uint8Array(5));
    const datasetObjectBytes = fromHex(datasetObjectId!);
    const id = toHex(new Uint8Array([...datasetObjectBytes, ...nonce]));
    const { encryptedObject: encryptedBytes } = await sealClient.encrypt({
      threshold: 1,
      packageId: TESTNET_PACKAGE_ID,
      id,
      data: dataToEncrypt
    })
    return encryptedBytes;
  }, [datasetObjectId, sealClient]);

  const encryptAndStoreDataset = useCallback(async (datasetToStore: SyntheticDataResultItem[], numEpochsToStore: number, encrypt: boolean) => {
    const dataToProcess = sanitizeDataset(datasetToStore);
    if (encrypt) {
      const encryptedData = await encryptBlob(dataToProcess);
      return await storeBlob(encryptedData, numEpochsToStore);
    } else {
      return await storeBlob(dataToProcess, numEpochsToStore);
    }
  }, [sanitizeDataset, encryptBlob]);

  const handleEpochsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      setNumEpochs(value);
    } else if (e.target.value === "") {
      setNumEpochs(1);
    }
  }, []);

  const handleConfirmUpload = useCallback(async () => {
    if (syntheticDatasetOutput.length === 0) return;
    setIsStoringDataset(true);
    try {
      const blobId = await encryptAndStoreDataset(syntheticDatasetOutput, numEpochs, true);
      setDatasetBlobId(blobId);
      toast("Upload Successful", { description: `Dataset stored successfully with ID: ${blobId}`, classNames: { title: 'text-black dark:text-white', description: 'text-black dark:text-white' } });
      setUploadCompleted(true);
    } catch (error: any) {
      toast.error("Upload Failed", { description: error.message || "Failed to encrypt and store dataset." });
      console.error("Failed to encrypt and store dataset:", error);
    } finally {
      setIsStoringDataset(false);
    }
  }, [syntheticDatasetOutput, numEpochs, encryptAndStoreDataset]);

  const handleCancelDialog = useCallback(() => {
    setIsUploadDialogOpen(false);
    setUploadCompleted(false);
    setSyntheticDatasetOutput([]);
    setNumEpochs(1);
    setDatasetBlobId(null);
  }, []);

  const handleLockDataset = useCallback(async () => {
    const currentDatasetName = form.getValues("datasetName");
    if (!datasetBlobId || !currentDatasetName.trim()) {
      toast.error("Locking Failed", { description: "Dataset Blob ID or Dataset Name is missing for locking." });
      return;
    }
    console.log(`Attempting to lock dataset: ${currentDatasetName} with blob ID: ${datasetBlobId}`);
    try {
      setIsLocking(true);

      const numRows = syntheticDatasetOutput.length;
      const numTokens = syntheticDatasetOutput.reduce((acc, item) => acc + (item.usage?.totalTokens || 0), 0);
      
      const tx = new Transaction();

      tx.moveCall({
        target: `${TESTNET_PACKAGE_ID}::dataset::lock_dataset`,
        arguments: [
          tx.object(datasetObjectId!),
          tx.pure.string(datasetBlobId!),
          tx.pure.u64(numRows),
          tx.pure.u64(numTokens),
        ]
      })

      signAndExecuteTransaction({ transaction: tx }, {
        onSuccess: () => {
          handleCancelDialog();
          form.reset();
          toast("Dataset Locked", { description: `Dataset \"${currentDatasetName}\" has been locked successfully.`, classNames: { title: 'text-black dark:text-white', description: 'text-black dark:text-white' } });

          router.push(`/dataset/${datasetObjectId!}`);
        },
        onError: (error: any) => {
          toast.error("Locking Failed", { description: `Failed to lock dataset (on-chain transaction): ${error.message || "Unknown error"}` });
          console.error("Failed to lock dataset (on-chain transaction):", error);
        }
      });
    } catch (error: any) {
      toast.error("Locking Failed", { description: `Failed to lock dataset (simulated): ${error.message || "Unknown error"}` });
      console.error("Failed to lock dataset (simulated):", error);
    } finally {
      setIsLocking(false);
    }
  }, [datasetBlobId, form, syntheticDatasetOutput, datasetObjectId, signAndExecuteTransaction, handleCancelDialog, router]);

  const handleGeneratePromptWithWizard = useCallback(async () => {
    setIsPromptGenerating(true);
    const inputFeature = form.getValues("inputFeature");
    const example = data[0].row[inputFeature];
    const prompt = await generatePromptWithWizard(wizardPrompt, inputFeature, example);
    form.setValue("prompt", prompt);
    setWizardPromptGenerated(true);
    setIsPromptGenerating(false);
    setIsWizardOpen(false);
  }, [wizardPrompt, form, data]);

  const colorFromAddress = useCallback((address: string): string => {
    const colors = [
      "#F87171",
      "#FBBF24",
      "#FCD34D",
      "#4ADE80",
      "#3B82F6",
    ];
  
    return colors[parseInt(address.slice(0, 8), 16) % colors.length];
  }, []);

  useEffect(() => {
    getModels().then((models) => {
      setModels(models);
    });
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!dataset) return;
      const response = await fetch(`https://datasets-server.huggingface.co/first-rows?dataset=${dataset.path}&config=${dataset.config}&split=${dataset.split}`);
      const data = await response.json();
      setData(data.rows.map((row: any) => row));
      setFeatures(data.features.map((feature: any) => feature.name));
    }
    fetchData();
  }, [dataset]);

  useEffect(() => {
    if (syntheticDatasetOutput.length > 0 && !isDatasetGenerationLoading && !isUploadDialogOpen) {
      setUploadCompleted(false);
      setIsUploadDialogOpen(true);
    }
  }, [syntheticDatasetOutput, isDatasetGenerationLoading]);

  const datasetViewMemo = useMemo(() => {
    return <DatasetViewer features={features} data={data} />
  }, [features, data]);

  useEffect(() => {
    console.log("form", form.formState.isValid, form.formState.errors);
  }, [form]);

  if (true) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] flex-col items-center justify-center gap-4 text-center">
        <ServerOff className="h-16 w-16 text-red-500" />
        <h1 className="text-3xl font-bold">Atoma Network Unavailable</h1>
        <p className="max-w-sm text-muted-foreground">
          We're sorry for the inconvenience, but the Atoma Network is currently
          unavailable. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="flex flex-col items-center justify-center py-8 gap-6">
          <div className="text-3xl font-bold">Create a Synthetic Dataset</div>
          <div className="w-full max-w-4xl space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>1. Select Your Dataset</CardTitle>
                <CardDescription>Choose a Hugging Face dataset to use as a base.</CardDescription>
              </CardHeader>
              <CardContent>
                <DatasetInput 
                  dataset={dataset} 
                  setDataset={setDataset}
                />
                {dataset && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-2">Dataset Preview</h3>
                    <div className="border rounded-md p-4 max-h-[400px] overflow-y-auto">
                      {datasetViewMemo}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {dataset && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>2. Configure Generation Parameters</CardTitle>
                    <CardDescription>Select a model and configure its generation parameters.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="modelId"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel>Model</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={models.length === 0}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a model" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {models.map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="maxTokens"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel>Max Tokens</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="1"
                                max={selectedModel ? selectedModel.max_num_compute_units : undefined}
                                {...field}
                              />
                            </FormControl>
                            {selectedModel && <FormDescription>Max for selected model: {selectedModel.max_num_compute_units}</FormDescription>}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="inputFeature"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel>Input Feature</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!dataset?.features?.length}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select input feature" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {dataset?.features.map((feature) => (
                                  <SelectItem key={feature} value={feature}>
                                    {feature}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="isStructured"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel className="flex items-center">Structured Output
                              <FormControl>
                                <Switch 
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className="ml-2"
                                />
                              </FormControl>
                            </FormLabel>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    {form.watch("isStructured") && (
                      <div>
                        <h3 className="text-lg font-semibold mb-2 mt-4">JSON Schema</h3>
                        <JsonSchemaInput schema={initialJsonSchema} setSchema={setJsonSchema} />
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>3. Define and Test Your Prompt</CardTitle>
                    <FormDescription>
                      Write a prompt to guide the AI. Test it on a few samples before full generation. 
                      You have {MAX_PREVIEW_ATTEMPTS - previewAttempts} attempts remaining.
                    </FormDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="prompt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg font-semibold">Generation Prompt</FormLabel>
                          <Tabs value={isWizardOpen ? "wizard" : "manual"} onValueChange={(value) => setIsWizardOpen(value === "wizard")}>
                            <TabsList>
                              <TabsTrigger value="wizard">Wizard</TabsTrigger>
                              <TabsTrigger value="manual">Manual</TabsTrigger>
                            </TabsList>
                            <TabsContent value="wizard">
                              <FormControl>
                                <Textarea
                                  placeholder="Describe your dataset generation task in a few sentences..."
                                  className="min-h-[100px] mt-2"
                                  value={wizardPrompt}
                                  onChange={(e) => {
                                    setWizardPrompt(e.target.value);
                                    setWizardPromptGenerated(false);
                                  }}
                                />
                              </FormControl>
                              <FormDescription>
                                Describe your dataset generation task in a few sentences.
                              </FormDescription>
                            </TabsContent>
                            <TabsContent value="manual">
                              <FormControl>
                                <Textarea 
                                  placeholder="Enter the prompt that will guide the generation task..."
                                  className="min-h-[100px] mt-2"
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription>
                                Use {"{input}"} to reference the input feature in your prompt.
                              </FormDescription>
                            </TabsContent>
                          </Tabs>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {isWizardOpen && wizardPrompt && !wizardPromptGenerated ? (
                      <Button 
                        type="button"
                        className="w-full bg-[#6750A4] hover:bg-[#6750A4]/90"
                        size="lg"
                        disabled={isPromptGenerating}
                        onClick={handleGeneratePromptWithWizard}
                      >
                        {isPromptGenerating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating Prompt...
                          </>
                        ) : (
                          <>
                            Generate Prompt with Wizard
                            <Sparkles className="h-4 w-4" color={colorFromAddress(currentAccount?.address || "")} />
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="w-full bg-[#6750A4] hover:bg-[#6750A4]/90"
                        size="lg"
                        disabled={
                          !form.watch("modelId") ||
                          !form.watch("inputFeature") ||
                          !form.watch("prompt").includes("{input}") ||
                          (form.watch("isStructured") && !jsonSchema) ||
                          isPreviewLoading ||
                          previewAttempts >= MAX_PREVIEW_ATTEMPTS ||
                          !currentAccount
                        }
                        onClick={handleTestGeneration}
                      >
                        {isPreviewLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating Preview...
                          </>
                        ) : previewAttempts >= MAX_PREVIEW_ATTEMPTS ? (
                          "Preview Limit Reached"
                        ) : (
                          `Test Generation With 3 Rows (${MAX_PREVIEW_ATTEMPTS - previewAttempts} left)`
                        )}
                      </Button>
                    )}

                    {previewData.length > 0 && form.getValues("inputFeature") && (
                      <div className="mt-6">
                        <h3 className="text-lg font-semibold mb-2">Preview Results</h3>
                        <div className="border rounded-md p-4 max-h-[400px] overflow-y-auto">
                          <DatasetViewer 
                            features={previewFeatures}
                            data={previewData}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>4. Finalize Dataset Details</CardTitle>
                    <CardDescription>
                      Provide the final details for your dataset before minting it on-chain.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="datasetName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Dataset Name</FormLabel>
                          <FormControl>
                            <Input placeholder="My Awesome AI Dataset" {...field} />
                          </FormControl>
                          <FormDescription>
                            This name will be used to identify your dataset on-chain.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Dataset Description (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="A brief description of your dataset..."
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormDescription>
                            Provide an optional description for your dataset.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="visibility"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel>Dataset Visibility</FormLabel>
                            <Select 
                              onValueChange={(value) => field.onChange(parseInt(value, 10))} 
                              defaultValue={String(field.value)}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select visibility" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="0">Public (Sellable)</SelectItem>
                                <SelectItem value="1">Private (Not Sellable)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Public datasets can be discovered and purchased by others.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {form.watch("visibility") === 0 && (
                        <FormField
                          control={form.control}
                          name="price"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel>Price (in USDC)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  min="0"
                                  placeholder="e.g., 1 USDC"
                                  {...field}
                                  value={field.value ?? ""}
                                />
                              </FormControl>
                              <FormDescription>
                                Set the price for accessing your public dataset (in USDC). 1 USDC = 1,000,000 MIST.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>5. Generate Full Dataset</CardTitle>
                    <CardDescription>
                      Once you're satisfied with the test, generate the complete synthetic dataset.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {syntheticDatasetOutput.length > 0 && !isDatasetGenerationLoading && !isUploadDialogOpen ? (
                      <Button
                        type="button"
                        onClick={(e) => { 
                          e.preventDefault(); 
                          setIsUploadDialogOpen(true); 
                        }}
                        className="w-full bg-yellow-500 hover:bg-yellow-600 text-white"
                        size="lg"
                      >
                        Reopen Upload & Lock Dialog
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        className="w-full bg-[#6750A4] hover:bg-[#6750A4]/90"
                        size="lg"
                        variant="default"
                        disabled={
                          isDatasetGenerationLoading || 
                          !form.formState.isValid ||
                          !dataset ||
                          !currentAccount
                        }
                      >
                        {isDatasetGenerationLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating Full Dataset...
                          </>
                        ) : (
                          "Generate Full Dataset"
                        )}
                      </Button>
                    )}
                    {isDatasetGenerationLoading && (
                      <div className="mt-4">
                        <Progress value={progress * 100} className="w-full" />
                        <p className="text-sm text-center mt-2">Generation progress: {Math.round(progress * 100)}%</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>{uploadCompleted ? "Lock Dataset" : "Upload Synthetic Dataset"}</DialogTitle>
                      <DialogDescription>
                        {uploadCompleted 
                          ? `Dataset "${form.getValues("datasetName")}" is ready to be locked on-chain.`
                          : "The generated dataset is ready. Enter the number of epochs for which this dataset will be available."
                        }
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      {!uploadCompleted ? (
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="epochs" className="text-right">
                            Epochs
                          </Label>
                          <Input
                            id="epochs"
                            type="number"
                            min="1"
                            value={numEpochs}
                            onChange={handleEpochsChange}
                            className="col-span-3"
                            disabled={isStoringDataset}
                          />
                        </div>
                      ) : (
                        <p className="text-sm text-center col-span-4">
                          Dataset Name: <strong>{form.getValues("datasetName")}</strong>
                        </p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={handleCancelDialog} disabled={isStoringDataset || isLocking}>
                        Cancel
                      </Button>
                      {!uploadCompleted ? (
                        <Button
                          type="submit"
                          onClick={handleConfirmUpload}
                          disabled={isStoringDataset || numEpochs <= 0}
                          className="bg-[#6750A4] hover:bg-[#6750A4]/90"
                        >
                          {isStoringDataset ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            "Confirm & Upload"
                          )}
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          onClick={handleLockDataset}
                          disabled={!form.getValues("datasetName").trim() || isLocking}
                          className="bg-[#6750A4] hover:bg-[#6750A4]/90"
                        >
                          {isLocking ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Locking...
                            </>
                          ) : (
                            "Lock Dataset"
                          )}
                        </Button>
                      )}
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}

export default function CreatePage() {
  return (
    <Suspense>
      <CreateInnerPage />
    </Suspense>
  )
}
