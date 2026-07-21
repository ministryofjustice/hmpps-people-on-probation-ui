import generateAdminOauthClientToken from './generateAdminOauthClientToken'

describe('generateAdminOauthClientToken', () => {
  it('generates a Basic auth token from a client id and secret', () => {
    const base64Creds = Buffer.from('bob:secret').toString('base64')
    expect(generateAdminOauthClientToken('bob', 'secret')).toBe(`Basic ${base64Creds}`)
  })

  it('generates a token correctly when the secret contains special characters', () => {
    const value = generateAdminOauthClientToken('bob', "p@'s&sw/o$+ rd1")
    const decoded = Buffer.from(value.substring(6), 'base64').toString('utf-8')

    expect(decoded).toBe("bob:p@'s&sw/o$+ rd1")
  })
})
