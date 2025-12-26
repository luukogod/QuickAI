"use client";

import { z } from "zod";
import { DatasetObject } from "@/lib/types";
import { getLockedDatasets } from "@/lib/actions";
import { Template } from "@/components/template-card";
import { DatasetList } from "@/components/dataset-list";
import { useCallback, useEffect, useState } from "react";
import { TemplateList } from "@/components/template-list";
import { X, BrainCircuit, Stethoscope, Bot } from "lucide-react";
import { useSuiClient, useCurrentAccount } from "@mysten/dapp-kit";

const templates: Template[] = [
  {
    name: "UltraChat Instruct",
    description: "Large-scale Dialogue Data",
    dataset: {
      path: "HuggingFaceH4/ultrachat_200k",
      config: "default",
      split: "train_sft",
    },
    prompt: "Read the following text and answer the questions contained within it based only on the information provided in the text: {input}",
    inputFeature: "prompt",
    maxTokens: 1000,
    modelId: "Infermatic/Llama-3.3-70B-Instruct-FP8-Dynamic",
    price: 1,
    visibility: 0,
    color: "purple",
    logo: <BrainCircuit className="h-8 w-8" />,
  },
  {
    name: "Medical Transcription",
    description: "Medical Transcription Data",
    dataset: {
      path: "galileo-ai/medical_transcription_40",
      config: "default",
      split: "train",
    },
    prompt: "Given the following medical transcription, classify it into one of these categories: [ Pain Management, Chiropractic, Podiatry, Pediatrics - Neonatal, Discharge Summary, Cosmetic / Plastic Surgery, Neurology, Endocrinology, Rheumatology, Orthopedic, Dentistry, Allergy / Immunology, Psychiatry / Psychology, Consult - History and Phy., Dermatology, Radiology, Speech - Language, Physical Medicine - Rehab, Sleep Medicine, Hospice - Palliative Care, Diets and Nutritions, Urology, ENT - Otolaryngology, Gastroenterology, Letters, Surgery, Bariatrics, Ophthalmology, Neurosurgery, Emergency Room Reports, Nephrology, Lab Medicine - Pathology, Office Notes, Cardiovascular / Pulmonary, SOAP / Chart / Progress Notes, Autopsy, General Medicine, IME-QME-Work Comp etc., Obstetrics / Gynecology, Hematology - Oncology]. After classifying, explain your reasoning for the chosen category. Medical Transcription: {input}",
    inputFeature: "text",
    maxTokens: 3000,
    modelId: "Infermatic/Llama-3.3-70B-Instruct-FP8-Dynamic",
    price: 5,
    visibility: 0,
    color: "blue",
    logo: <Stethoscope className="h-8 w-8" />,
    jsonSchema: z.object({
      explanation: z.string().describe("The explanation of the label"),
      label: z.enum([" Pain Management", " Chiropractic", " Podiatry", " Pediatrics - Neonatal", " Discharge Summary", " Cosmetic / Plastic Surgery", " Neurology", " Endocrinology", " Rheumatology", " Orthopedic", " Dentistry", " Allergy / Immunology", " Psychiatry / Psychology", " Consult - History and Phy.", " Dermatology", " Radiology", " Speech - Language", " Physical Medicine - Rehab", " Sleep Medicine", " Hospice - Palliative Care", " Diets and Nutritions", " Urology", " ENT - Otolaryngology", " Gastroenterology", " Letters", " Surgery", " Bariatrics", " Ophthalmology", " Neurosurgery", " Emergency Room Reports", " Nephrology", " Lab Medicine - Pathology", " Office Notes", " Cardiovascular / Pulmonary", " SOAP / Chart / Progress Notes", " Autopsy", " General Medicine", " IME-QME-Work Comp etc.", " Obstetrics / Gynecology", " Hematology - Oncology"]).describe("The label of the medical transcription"),
    }),
  },
  {
    name: "Semantic Search",
    description: "A dataset for Semantic Search",
    dataset: {
      path: "tollan/chat-semantic-search",
      config: "default",
      split: "train",
    },
    prompt: "For the given text, you need to determine if the answer is valid or not. The text is: {input}",
    inputFeature: "text",
    maxTokens: 1000,
    modelId: "Infermatic/Llama-3.3-70B-Instruct-FP8-Dynamic",
    price: 1,
    visibility: 0,
    color: "green",
    logo: <Bot className="h-8 w-8" />,
    jsonSchema: z.object({
      valid: z.boolean().describe("Whether the answer is valid or not"),
    }),
  },
];

export default function Home() {
  const suiClient = useSuiClient();
  const currentAccount = useCurrentAccount();
  const [showTemplates, setShowTemplates] = useState(true);
  const [lockedDatasets, setLockedDatasets] = useState<DatasetObject[]>([]);

  useEffect(() => {
    getLockedDatasets().then(datasets => {
      setLockedDatasets(datasets);
    });
  }, []);

  const resolveNameServiceNames = useCallback(async (address: string) => {
    const response = await suiClient.resolveNameServiceNames({
      address,
      format: "at",
    });
    return response.data[0];
  }, [suiClient])

  return (
    <div className="container mx-auto p-3">
      {showTemplates && templates.length > 0 && (
        <div className="flex justify-center my-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-4 max-w-xl w-full">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Create from a template</h2>
              <button
                onClick={() => setShowTemplates(false)}
                className="p-1 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                aria-label="Close templates"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <TemplateList templates={templates} />
          </div>
        </div>
      )}
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Trending Datasets</h2>
        {lockedDatasets.length > 0 && (
          <DatasetList datasets={lockedDatasets} currentAddress={currentAccount?.address} resolveNameServiceNames={resolveNameServiceNames} />
        )}
      </div>
    </div>
  );
}
