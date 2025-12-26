import { cn } from "@/lib/utils";
import { HFDataset } from "@/lib/types";
import { useEffect, useState, memo } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

const DatasetInputComponent = ({
  dataset,
  setDataset
}: {
  dataset: HFDataset | null;
  setDataset: (dataset: HFDataset) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [popOpen, setPopOpen] = useState(false);
  const [path, setPath] = useState(dataset?.path || "");
  const [error, setError] = useState<string | null>(null);
  const [completions, setCompletions] = useState<string[]>([]);
  const [split, setSplit] = useState<string | null>(dataset?.split || null);
  const [config, setConfig] = useState<string | null>(dataset?.config || null);
  const [configsAndSplits, setConfigsAndSplits] = useState<Record<string, string[]>>({});

  const quickSearch = async (value: string) => {
    const response = await fetch(`https://huggingface.co/api/quicksearch?q=${value}&type=dataset`)
    const data = await response.json();
    setCompletions(data.datasets.map((dataset: any) => dataset.id));
  }

  const getConfigsAndSplits = async (dataset: string) => {
    const response = await fetch(`https://datasets-server.huggingface.co/splits?dataset=${dataset}`)

    if (!response.ok) {
      console.error("Error fetching dataset configs and splits:", response.status);
      setError("This dataset is not available. It might require authentication or may not exist.");
      setConfigsAndSplits({});
      setConfig(null);
      setSplit(null);
      return;
    }

    const data = await response.json();

    const configsAndSplits: Record<string, string[]> = {};
    
    data.splits.forEach((item: any) => {
      if (!configsAndSplits[item.config]) {
        configsAndSplits[item.config] = [];
      }
      configsAndSplits[item.config].push(item.split);
    });
    
    setConfigsAndSplits(configsAndSplits);
    setError(null);

    setConfig(null);
    setSplit(null);

    if (Object.keys(configsAndSplits).length === 1) {
      const newConfig = Object.keys(configsAndSplits)[0];
      setConfig(newConfig);

      if (configsAndSplits[newConfig] && configsAndSplits[newConfig].length === 1) {
        setSplit(configsAndSplits[newConfig][0]);
      }
    }
  }

  const isTextOrMessages = (feature: any) => {
    if (feature?.dtype === "string") {
      return true;
    }

    // For now, we only support string features
    // if (Array.isArray(feature) && feature.length === 1) {
    //   const dtype = feature[0];
    //   return dtype.content.dtype === "string" && dtype.role.dtype === "string";
    // }

    return false;
  }

  const getFeaturesAndSetDataset = async (path: string, config: string, split: string) => {
    const response = await fetch(`https://datasets-server.huggingface.co/info?dataset=${path}&config=${config}`)
    const data = await response.json();

    setDataset({ path, config, split, features: Object.keys(data.dataset_info.features || {}).filter((feature: string) => {
      return isTextOrMessages(data.dataset_info.features[feature])
    }) });
  }

  useEffect(() => {
    quickSearch(path);
  }, []);

  useEffect(() => {
    if (path && completions.find((completion) => completion === path)) {
      getConfigsAndSplits(path);
    } else {
      setConfigsAndSplits({});
      setConfig(null);
      setSplit(null);
      setError(null);
    }
  }, [path, completions]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          {dataset ? dataset.path : "Select a dataset"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select a dataset</DialogTitle>
          <DialogDescription>
            Search for a dataset to use in your project.
          </DialogDescription>
          {error && (
            <DialogDescription className="text-red-500">
              {error}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Dataset</Label>
            <Popover open={popOpen} onOpenChange={setPopOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={popOpen}
                  className="justify-between col-span-3"
                >
                  {path && completions.find((completion) => completion === path)
                    ? path
                    : "Select a dataset..."}
                  <ChevronsUpDown className="opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0">
                <Command>
                  <CommandInput
                    placeholder="Search dataset..."
                    className="h-9"
                    value={path}
                    onValueChange={(e) => {
                      setPath(e);
                      quickSearch(e);
                      setError(null);
                    }} />
                  <CommandList>
                    <CommandEmpty>No dataset found.</CommandEmpty>
                    <CommandGroup>
                      {completions.map((completion) => (
                        <CommandItem
                          key={completion}
                          value={completion}
                          onSelect={(currentValue) => {
                            setPath(currentValue === path ? "" : currentValue)
                            setPopOpen(false)
                          }}
                        >
                          {completion}
                          <Check
                            className={cn(
                              "ml-auto",
                              path === completion ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          {Object.keys(configsAndSplits).length > 0 && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Config</Label>
                <Select value={config || ""} onValueChange={(value) => {
                  setConfig(value);

                  if (configsAndSplits[value] && configsAndSplits[value].length === 1) {
                    setSplit(configsAndSplits[value][0]);
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a config" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(configsAndSplits).map((config) => (
                      <SelectItem key={config} value={config}>{config}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Split</Label>
                <Select value={split || ""} onValueChange={(value) => {
                  setSplit(value);
                }}>
                  <SelectTrigger disabled={!config}>
                    <SelectValue placeholder="Select a split" />
                  </SelectTrigger>
                  <SelectContent>
                    {configsAndSplits[config || ""] && configsAndSplits[config || ""].map((split) => (
                      <SelectItem key={split} value={split}>{split}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={!path || !config || !split || !!error} onClick={() => {
            setOpen(false);
            getFeaturesAndSetDataset(path, config || "", split || "");
          }}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default memo(DatasetInputComponent);
