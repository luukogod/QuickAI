"use server";

import { z } from "zod";
import { Buffer } from "buffer";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { TESTNET_PUBLISHERS } from "@/lib/constants";
import { GenerationConfig, HFDataset } from "@/lib/types";
import { JSONSchemaToZod } from "@dmitryrechkin/json-schema-to-zod";

const atoma = createOpenAI({
  apiKey: process.env.ATOMA_API_KEY,
  baseURL: "https://api.atoma.network/v1",
});

export async function getRows(dataset: HFDataset, offset: number, length: number) {
  const response = await fetch(`https://datasets-server.huggingface.co/rows?dataset=${dataset.path}&config=${dataset.config}&split=${dataset.split}&offset=${offset}&length=${length}`);
  const data = await response.json();

  return data.rows;
}

type ResponseBody = {
  signature: string;
  response_hash: string;
}

export async function generateRow(row: string, config: GenerationConfig, maxTokens: number) {
  try {
    const prompt = config.prompt.replace("{input}", row);

    if (config.jsonSchema) {
      const { object, usage, response: { body } } = await generateObject({
        model: atoma(config.model),
        prompt,
        schema: JSONSchemaToZod.convert(config.jsonSchema),
        maxTokens,
      });

      const { signature, response_hash } = body as ResponseBody;

      return {
        result: object,
        usage,
        signature,
        response_hash,
      };
    } else {
      const { text, usage, response: { body } } = await generateText({
        model: atoma(config.model),
        prompt,
        maxTokens,
      });

      const { signature, response_hash } = body as ResponseBody;

      return {
        result: text,
        usage,
        signature,
        response_hash,
      };
    }
  } catch (error) {
    return {
      result: "No output generated",
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: maxTokens,
      },
      signature: "",
      response_hash: "",
    };
  }
}

export async function generatePromptWithWizard(prompt: string, inputFeature: string, example: string) {
  const wizardInstructionPrompt = `You are an expert prompt engineer. A user wants to generate a synthetic dataset and has provided the following description of their goal:
  "${prompt}"

  The user has specified that the primary input feature from their source dataset is named '${inputFeature}'.
  Here is an example of what the data for this input feature looks like: "${example}"

Based on the user's goal, the input feature name, and the example data, create a clear, concise, and effective prompt that will be used by another AI to generate individual synthetic data entries. This generated prompt MUST:
1. Directly address the user's described goal.
2. Be suitable for generating high-quality, realistic synthetic data relevant to the provided example.
3. Include the exact placeholder '{input}' where a single data point (like the example provided for '${inputFeature}') will be injected. Do not use any other placeholder format.

The final generated prompt should be ready to use for data generation.
Example of a good output if user wants summaries of articles (and inputFeature was 'articleText'): "Summarize the following article in 3 sentences: {input}"
Example of a good output if user wants to classify customer feedback (and inputFeature was 'feedbackComment'): "Classify the sentiment of this customer feedback as positive, negative, or neutral: {input}"

Generated Prompt for Data Synthesis:`;

  const { object: promptObject } = await generateObject({
    model: google("gemini-2.5-flash-preview-05-20"),
    prompt: wizardInstructionPrompt,
    schema: z.object({
      prompt: z.string().describe("A detailed and effective prompt for an AI model to generate synthetic data. This prompt must include the '{input}' placeholder to be replaced with the actual row data."),
    }),
    temperature: 0.3,
  })

  return promptObject.prompt;
}

export const storeBlob = async (encryptedData: Uint8Array, numEpochs: number) => {
  while (true) {
    try {
      const url = TESTNET_PUBLISHERS[Math.floor(Math.random() * TESTNET_PUBLISHERS.length)];
      const response = await fetch(`${url}/v1/blobs?epochs=${numEpochs}`, {
        method: "PUT",
        body: Buffer.from(encryptedData),
      });

      if (response.ok) {
        const data = await response.json();
        return data.newlyCreated.blobObject.blobId;
      }
    } catch (error) {
      console.error(error);
    }
  }
}
