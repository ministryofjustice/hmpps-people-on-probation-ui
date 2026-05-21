import { createOneLoginTransaction } from './loginTransactionStore'

describe('loginTransactionStore', () => {
  it('stores the registration invite token on a new One Login transaction', () => {
    const transaction = createOneLoginTransaction('/dashboard', 'invite-token')

    expect(transaction.returnTo).toEqual('/dashboard')
    expect(transaction.registrationInviteToken).toEqual('invite-token')
  })

  it('creates a normal One Login transaction without a registration invite token', () => {
    const transaction = createOneLoginTransaction('/dashboard')

    expect(transaction.returnTo).toEqual('/dashboard')
    expect(transaction.registrationInviteToken).toBeUndefined()
  })
})
