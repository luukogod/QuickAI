"use server";

import { SuiClient } from "@mysten/sui/client";
import { getFullnodeUrl } from "@mysten/sui/client";
import { HFDataset, DatasetObject } from "@/lib/types";
import { TESTNET_PACKAGE_ID, TESTNET_DEBUG_OBJECTS, TESTNET_AGGREGATORS } from "@/lib/constants";

const suiClient = new SuiClient({
  url: getFullnodeUrl("testnet"),
});

export async function getRows(dataset: HFDataset, offset: number, length: number) {
  const response = await fetch(`https://datasets-server.huggingface.co/rows?dataset=${dataset.path}&config=${dataset.config}&split=${dataset.split}&offset=${offset}&length=${length}`);
  const data = await response.json();
  return data.rows;
}

export async function getModels() {
  const responseModels = await fetch("https://api.atoma.network/v1/models", {
    headers: {
      "Authorization": `Bearer ${process.env.ATOMA_API_KEY}`
    }
  });

  if (!responseModels.ok) {
    return [];
  }

  const data = (await responseModels.json()).data;

  const responseTasks = await fetch("https://credentials.atoma.network/tasks");
  const tasks = await responseTasks.json();

  const responseSubscriptions = await fetch("https://credentials.atoma.network/subscriptions");
  const subscriptions = await responseSubscriptions.json();

  return data.map((model: any) => {
    const task = tasks.find((task: any) => task[0].model_name === model.id);
    const subscription = subscriptions.find((subscription: any) => subscription.task_small_id === task[0].task_small_id);
    return {
      ...model,
      task_small_id: task[0].task_small_id,
      price_per_one_million_compute_units: subscription.price_per_one_million_compute_units,
      max_num_compute_units: subscription.max_num_compute_units
    }
  });
}

export async function getBlob(blobId: string) {
  while (true) {
    try {
      const url = TESTNET_AGGREGATORS[Math.floor(Math.random() * TESTNET_AGGREGATORS.length)];
      const response = await fetch(`${url}/v1/blobs/${blobId}`);
      if (response.ok) {
        const data = await response.arrayBuffer();
        return new Uint8Array(data);
      }
    } catch (error) {
      console.error(error);
    }
  }
}

const _mapRawObjectToDatasetObject = (rawObject: any): DatasetObject => {
  const content = rawObject.data!.content! as any;
  const fields = content.fields;

  return {
    id: rawObject.data!.objectId,
    version: Number(fields.version),
    owner: fields.owner,
    name: fields.name,
    description: fields.description,
    price: Number(fields.price),
    visibility: {
      inner: Number(fields.visibility.fields.inner),
    },
    blobId: fields.blob_id,
    metadata: {
      numRows: fields.metadata.fields.num_rows,
      numTokens: fields.metadata.fields.num_tokens,
    },
    hfMetadata: {
      path: fields.hf_metadata.fields.path,
      config: fields.hf_metadata.fields.config,
      split: fields.hf_metadata.fields.split,
      revision: fields.hf_metadata.fields.revision,
    },
    stats: {
      numDownloads: fields.stats.fields.num_downloads,
    },
    modelMetadata: {
      name: fields.model_metadata.fields.name,
      taskSmallId: fields.model_metadata.fields.task_small_id,
      nodeSmallId: fields.model_metadata.fields.node_small_id,
      pricePerOneMillionComputeUnits: fields.model_metadata.fields.price_per_one_million_compute_units,
      maxNumComputeUnits: fields.model_metadata.fields.max_num_compute_units,
    },
    allowlist: fields.allowlist,
  };
};

export async function getDataset(id: string): Promise<DatasetObject> {
  const result = await suiClient.getObject({
    id: id,
    options: {
      showContent: true,
    }
  });

  if (!result.data || !result.data.content || result.data.content.dataType !== 'moveObject') {
    throw new Error(`Dataset object ${id} not found or is not a Move object.`);
  }

  return _mapRawObjectToDatasetObject(result);
}

export async function getLockedDatasets(): Promise<DatasetObject[]> {
  const { data } = await suiClient.queryEvents({
    query: {
      MoveEventType: `${TESTNET_PACKAGE_ID}::dataset::DatasetLockedEvent`
    }
  });

  const filteredEvents = data.filter((event) => {
    const content = event.parsedJson as any;
    return !TESTNET_DEBUG_OBJECTS.includes(content.dataset);
  });

  const objects = await suiClient.multiGetObjects({
    ids: filteredEvents.map((event) => (event.parsedJson as any).dataset),
    options: {
      showContent: true,
    }
  });

  return objects.map(_mapRawObjectToDatasetObject);
}

export async function getPersonalDatasets(address: string): Promise<DatasetObject[]> {
  if (!address) return [];

  const res = await suiClient.getOwnedObjects({
    owner: address,
    filter: {
      StructType: `${TESTNET_PACKAGE_ID}::dataset::DatasetOwnership`
    },
    options: {
      showContent: true,
    }
  });

  const filteredObjects = res.data.filter((obj) => {
    const content = obj.data!.content! as any;
    return !TESTNET_DEBUG_OBJECTS.includes(content.fields.dataset_id);
  });

  const objects = await suiClient.multiGetObjects({
    ids: filteredObjects.map((obj) => (obj.data!.content! as any).fields.dataset_id),
    options: {
      showContent: true,
    }
  });

  return objects.filter((obj) => {
    const content = obj.data!.content! as any;
    return content.fields.version > 0;
  }).map(_mapRawObjectToDatasetObject);
}
