"use client";

import Link from "next/link";
import Name from "@/components/name";
import Avatar from "@/components/avatar";
import { notFound } from "next/navigation";
import { DatasetObject } from "@/lib/types";
import { useSuiClient } from "@mysten/dapp-kit";
import { getPersonalDatasets } from "@/lib/actions";
import { DatasetList } from "@/components/dataset-list";
import { use, useCallback, useEffect, useState } from "react";

const isSuiAddress = (address: string) => {
  return address.startsWith("0x") && address.length === 66;
};

export default function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const suiClient = useSuiClient();
  const [address, setAddress] = useState<string | null>(null);
  const [personalDatasets, setPersonalDatasets] = useState<DatasetObject[]>([]);

  const resolveNameServiceAddress = useCallback((name: string) => {
    return suiClient.resolveNameServiceAddress({ name });
  }, [suiClient]);

  const getExplorerUrl = (address: string) => {
    return `https://testnet.suivision.xyz/address/${address}`;
  };

  useEffect(() => {
    if (isSuiAddress(id)) {
      setAddress(id);
    } else {
      resolveNameServiceAddress(`@${id}`).then((address) => {
        if (address) {
          setAddress(address);
        } else {
          notFound();
        }
      });
    }
  }, [id, resolveNameServiceAddress]);

  useEffect(() => {
    if (!address) return;
    getPersonalDatasets(address).then((datasets) => {
      setPersonalDatasets(datasets);
    });
  }, [address]);

  const resolveNameServiceNames = useCallback(async (address: string) => {
    const response = await suiClient.resolveNameServiceNames({
      address,
      format: "at",
    });
    return response.data[0];
  }, [suiClient])

  return (
    <div className="container mx-auto p-4">
      {address && (
        <div className="flex items-center space-x-4 p-4 border-b border-gray-200">
          <Avatar address={address} />
          <div>
            <Link href={getExplorerUrl(address)} target="_blank" rel="noopener noreferrer" className="text-xl font-semibold hover:underline">
              <Name address={address} resolveNameServiceNames={resolveNameServiceNames} />
            </Link>
            <p className="text-sm text-gray-600">{personalDatasets.length} Datasets</p>
          </div>
        </div>
      )}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Personal Datasets</h2>
        {personalDatasets.length > 0 ? (
          <DatasetList datasets={personalDatasets} resolveNameServiceNames={resolveNameServiceNames} />
        ) : (
          <p>No datasets found for this user.</p>
        )}
      </div>
    </div>
  );
}
