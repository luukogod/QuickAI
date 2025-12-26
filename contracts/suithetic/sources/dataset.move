module suithetic::dataset {
    use sui::event;
    use usdc::usdc::USDC;
    use std::string::String;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    
    /// Error codes.
    const ENoAccess: u64 = 0;
    const EDatasetNotPublic: u64 = 1;
    const EIncorrectAmount: u64 = 2;
    const EAlreadyLockedDataset: u64 = 3;

    /// Visibility of a dataset.
    /// 
    /// 0 - Public (sellable).
    /// 1 - Private (non-sellable).
    public struct Visibility has store, copy, drop {
        inner: u16,
    }

    /// Contains the metadata of the original Hugging Face dataset.
    public struct HFDatasetMetadata has store {
        /// The path to the dataset on Hugging Face.
        path: String,
        /// The config of the dataset.
        config: String,
        /// The split of the dataset.
        split: String,
        /// The revision of the dataset (the commit hash).
        revision: String,
    }

    /// Contains the metadata of the dataset.
    public struct DatasetMetadata has store {
        /// The number of rows in the dataset.
        num_rows: Option<u64>,
        /// The number of tokens in the dataset.
        num_tokens: Option<u64>,
    }

    /// Contains the metadata of the model used to generate the dataset.
    public struct ModelMetadata has store {
        /// The name of the model.
        name: String,
        /// The task small id used to generate the dataset.
        task_small_id: u64,
        /// The node small id used to generate the dataset.
        node_small_id: u64,
        /// The price per one million compute units of the model.
        price_per_one_million_compute_units: u64,
        /// The max number of compute units of the model.
        max_num_compute_units: u64,
    }

    /// Contains the stats of the dataset
    public struct DatasetStats has store {
        /// The number of downloads of the dataset.
        num_downloads: u64,
    }

    /// Represents the ownership of a dataset.
    public struct DatasetOwnership has key, store {
        id: UID,
        /// The ID of the owned dataset.
        dataset_id: ID,
    }

    /// Represents a dataset.
    public struct Dataset has key {
        id: UID,
        /// The version of the dataset. If the version is 0, the dataset is not locked.
        /// If the version is greater than 0, the dataset is locked and is ready to be downloaded.
        version: u64,
        /// The owner of the dataset.
        owner: address,
        /// The name of the dataset.
        name: String,
        /// The description of the dataset.
        description: Option<String>,
        /// The price of the dataset. This is the price in USDC.
        /// The value is set to 0 if the dataset is private (non-sellable).
        price: u64,
        /// The visibility of the dataset.
        visibility: Visibility,
        /// The blob id of the dataset on the Walrus network.
        blob_id: Option<String>,
        /// The metadata of the dataset.
        metadata: DatasetMetadata,
        /// The metadata of the original Hugging Face dataset.
        hf_metadata: HFDatasetMetadata,
        /// The stats of the dataset.
        stats: DatasetStats,
        /// The balance of the dataset.
        balance: Balance<USDC>,
        /// The allowlist of the dataset.
        /// This list is used to decrypt the dataset.
        allowlist: vector<address>,
        /// The metadata of the model used to generate the dataset.
        model_metadata: ModelMetadata,
    }

    /// Emitted when a dataset is locked.
    public struct DatasetLockedEvent has copy, drop {
        /// The unique identifier of the dataset.
        dataset: ID,
        /// The version of the dataset.
        version: u64,
        /// The visibility of the dataset.
        visibility: Visibility,
    }

    /// Method to mint a dataset. This should happens before encrypting the dataset
    /// bacause we need to know the ID of the dataset before encrypting it.
    public fun mint_dataset(
        hf_path: String,
        hf_config: String,
        hf_split: String,
        hf_revision: String,
        visibility: u16,
        name: String,
        description: String,
        price: u64,
        model_name: String,
        model_task_small_id: u64,
        model_node_small_id: u64,
        model_price_per_one_million_compute_units: u64,
        model_max_num_compute_units: u64,
        ctx: &mut TxContext
    ): DatasetOwnership {
        let dataset = Dataset {
            id: object::new(ctx),
            version: 0,
            owner: ctx.sender(),
            name: name,
            description: option::some(description),
            price: price,
            visibility: Visibility { inner: visibility },
            blob_id: option::none(),
            metadata: DatasetMetadata {
                num_rows: option::none(),
                num_tokens: option::none(),
            },
            hf_metadata: HFDatasetMetadata {
                path: hf_path,
                config: hf_config,
                split: hf_split,
                revision: hf_revision,
            },
            stats: DatasetStats {
                num_downloads: 0,
            },
            balance: balance::zero(),
            allowlist: vector::empty(),
            model_metadata: ModelMetadata {
                name: model_name,
                task_small_id: model_task_small_id,
                node_small_id: model_node_small_id,
                price_per_one_million_compute_units: model_price_per_one_million_compute_units,
                max_num_compute_units: model_max_num_compute_units,
            },
        };

        let ownership = DatasetOwnership {
            id: object::new(ctx),
            dataset_id: object::id(&dataset),
        };

        transfer::share_object(dataset);

        ownership
    }

    /// Method to lock the dataset with the blob id and the number of rows and tokens.
    /// We use this method to add the generated data to the dataset.
    public fun lock_dataset(dataset: &mut Dataset, blob_id: String, num_rows: u64, num_tokens: u64) {
        assert!(dataset.version == 0, EAlreadyLockedDataset);

        dataset.blob_id = option::some(blob_id);
        dataset.metadata.num_rows = option::some(num_rows);
        dataset.metadata.num_tokens = option::some(num_tokens);

        dataset.version = 1;

        event::emit(DatasetLockedEvent {
            dataset: object::id(dataset),
            version: dataset.version,
            visibility: dataset.visibility,
        });
    }

    /// Method to download the dataset. A dataset can be downloaded by anyone if it is public.
    public fun download_dataset(self: &mut Dataset, payment: Coin<USDC>, ctx: &mut TxContext) {
        assert!(self.visibility.inner == 0, EDatasetNotPublic);

        let amount = coin::value(&payment);
        assert!(amount == self.price, EIncorrectAmount);

        coin::put(&mut self.balance, payment);

        self.stats.num_downloads = self.stats.num_downloads + 1;
        self.allowlist.push_back(ctx.sender());
    }

    /// Method to change the name of the dataset.
    public fun change_name(self: &mut Dataset, name: String, ctx: &mut TxContext) {
        assert!(self.owner == ctx.sender(), ENoAccess);

        self.name = name;
    }

    /// Method to change the description of the dataset.
    public fun change_description(self: &mut Dataset, description: String, ctx: &mut TxContext) {
        assert!(self.owner == ctx.sender(), ENoAccess);

        self.description = option::some(description);
    }

    /// Method to change the price of the dataset.
    public fun change_price(self: &mut Dataset, price: u64, ctx: &mut TxContext) {
        assert!(self.owner == ctx.sender(), ENoAccess);

        self.price = price;
    }

    /// Method to withdraw the balance of the dataset.
    public fun withdraw_balance(self: &mut Dataset, ctx: &mut TxContext): Coin<USDC> {
        assert!(self.owner == ctx.sender(), ENoAccess);

        let amount = self.balance.value();
        coin::take(&mut self.balance, amount, ctx)
    }

    fun approve_internal(id: vector<u8>, dataset: &Dataset, caller: address): bool {
        // Disallow the caller to decrypt the dataset if it is private.
        if (!is_prefix(dataset.id.to_bytes(), id)) {
            return false
        };

        dataset.owner == caller || dataset.allowlist.contains(&caller)
    }

    /// Definition of the `seal_approve` function to use Seal.
    entry fun seal_approve(id: vector<u8>, dataset: &Dataset, ctx: &TxContext) {
        assert!(approve_internal(id, dataset, ctx.sender()), ENoAccess);
    }

    fun is_prefix(prefix: vector<u8>, word: vector<u8>): bool {
        if (prefix.length() > word.length()) {
            return false
        };
        let mut i = 0;
        while (i < prefix.length()) {
            if (prefix[i] != word[i]) {
                return false
            };
            i = i + 1;
        };
        true
    }
}
