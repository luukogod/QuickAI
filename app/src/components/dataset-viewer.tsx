"use client";

import { useState } from "react";
import { verifyEd25519Signature } from "@/lib/utils";
import { BadgeAlert, BadgeCheck } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function DatasetViewer({
  features,
  data,
  maxLength = 100,
}: {
  features: string[];
  data: any[];
  maxLength?: number;
}) {
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  const innerFeatures = features.slice();
  if (data.length > 0 && data[0].signature) {
    innerFeatures.push("Verified");
  }
  return innerFeatures.length > 0 && (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            {innerFeatures.map((feature) => (
              <TableHead key={feature}>{feature}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, index) => (
            <TableRow key={row.row_idx} onClick={() => setSelectedRow(index === selectedRow ? null : index)}>
              {innerFeatures.map((feature) => (
                <TableCell
                key={feature}
                className={`text-xs max-w-[250px] whitespace-pre-wrap break-words overflow-hidden`}
                >
                {
                  feature === "Verified" ? (
                    verifyEd25519Signature(row.signature, row.response_hash) ? (
                      <BadgeCheck className="text-green-500" />
                    ) : (
                      <BadgeAlert className="text-red-500" />
                    )
                  ) : typeof row.row[feature] === 'object' && row.row[feature] !== null ? (
                    (() => {
                      const jsonString = JSON.stringify(row.row[feature], null, 2);
                      if (jsonString.length > maxLength && selectedRow !== index) {
                        return `${jsonString.slice(0, maxLength)}...`;
                      }
                      return jsonString;
                    })()
                  ) : typeof row.row[feature] === 'string' && row.row[feature].length > maxLength && selectedRow != index ? (
                    `${row.row[feature].slice(0, maxLength)}...`
                  ) : (
                    row.row[feature]
                  )
                }
              </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
