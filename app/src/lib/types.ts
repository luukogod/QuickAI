export type HFDataset = {
  path: string;
  config: string;
  split: string;
  features: string[];
}

export type WalrusService = {
  id: string;
  name: string;
  publisherUrl: string;
  aggregatorUrl: string;
};

export type GenerationConfig = {
  model: string;
  inputFeature: string;
  maxTokens: number;
  prompt: string;
  jsonSchema?: any;
}

export type SyntheticDataResultItem = {
  input?: any;
  data?: any;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  signature?: string;
  responseHash?: string;
};

export type AtomaModel = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  task_small_id: number;
  price_per_one_million_compute_units: number;
  max_num_compute_units: number;
}

export type Visibility = {
  inner: number;
};

export type HFDatasetMetadata = {
  path: string;
  config: string;
  split: string;
  revision: string;
};

export type DatasetOnChainMetadata = {
  numRows: number;
  numTokens: number;
};

export type ModelOnChainMetadata = {
  name: string;
  taskSmallId: number;
  nodeSmallId: number;
  pricePerOneMillionComputeUnits: number;
  maxNumComputeUnits: number;
};

export type DatasetStats = {
  numDownloads: number;
};

export type DatasetObject = {
  id: string;
  version: number;
  owner: string;
  name: string;
  description: string;
  price: number;
  visibility: Visibility;
  blobId: string;
  metadata: DatasetOnChainMetadata;
  hfMetadata: HFDatasetMetadata;
  stats: DatasetStats;
  modelMetadata: ModelOnChainMetadata;
  allowlist: string[];
};

export type DatasetListedEventObject = {
  dataset: string;
  version: number;
  visibility: Visibility;
}
