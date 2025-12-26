module suithetic::suithetic {
    use sui::package;
    use usdc::usdc::USDC;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};


    /// The suithetic vault. This is used to receive the USDC payments when generating a dataset.
    public struct Suithetic has key {
        id: UID,
        /// The balance of the suithetic vault.
        balance: Balance<USDC>
    }

    /// One time witness to claim the suithetic package.
    public struct SUITHETIC has drop {}

    fun init(otw: SUITHETIC, ctx: &mut TxContext) {
        package::claim_and_keep(otw, ctx);

        let suithetic = Suithetic {
            id: object::new(ctx),
            balance: balance::zero()
        };

        transfer::share_object(suithetic);
    }

    /// Method to pay the suithetic vault.
    public fun add_to_balance(suithetic: &mut Suithetic, coin: Coin<USDC>) {
        coin::put(&mut suithetic.balance, coin)
    }
}
