::wavedoc
---
title: Add to Collection
description: |
  The Add to Collection node adds one or more assets, or one or more collections, to a collection in Iconik. It sends one request per object, one after the other, and keeps going when a single object fails: the failures are listed in the Failed output and the node still ends on Success. It fails only when no object could be added. An object that is already in the collection counts as added: when Iconik rejects an add with 400 or 409, the node asks Iconik whether the object is already there and, if so, lists it under Added IDs. Three errors concern every object and stop the node at once: a collection Iconik does not find (404), rejected credentials (401 or 403), and no answer from Iconik (unreachable or no answer within 30 seconds); objects added before that stay in the collection. Other errors for one object, including a rate limit that persists after 3 attempts, are listed in Failed. The node authenticates with an Iconik App ID and Auth Token; wire both from Get Secret nodes. Iconik requires the can_write_collections and can_read_collections roles for these requests. When Iconik rate-limits a request (429), the node tries it again, up to 3 attempts in total.
inputs:
  - name: App ID
    description: |
      Enter the app ID for the Iconik API. Leading and trailing spaces are removed. Replaced by a placeholder in the Curl output
    type: STRING_PASSWORD
    mandatory: true
    example:
      - name: App ID
        value: "example-app-id"
  - name: Auth Token
    description: |
      Enter the auth token for the Iconik API that belongs to the App ID. Leading and trailing spaces are removed. Replaced by a placeholder in the Curl output and in error messages
    type: STRING_PASSWORD
    mandatory: true
    example:
      - name: Auth Token
        value: "example-auth-token"
  - name: Collection ID
    description: |
      Enter the ID of the collection to add to, for example the Collection ID output of Create Collection. It must be a UUID (36 characters with hyphens, upper or lower case); leading and trailing spaces are removed
    type: STRING
    mandatory: true
    example:
      - name: Collection ID
        value: "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d"
  - name: Object IDs
    description: |
      Enter the IDs of the assets or collections to add, one per entry. An entry may also be a wildcard to another node's list output, such as the Object IDs of Search, or several IDs separated by commas, semicolons or new lines. Every ID must be a UUID; duplicates are added once. An empty list, or any ID that is not a UUID, fails the node before a request is sent
    type: STRING_LIST
    mandatory: true
    example:
      - name: Object IDs
        value: '["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"]'
  - name: Object Type
    description: |
      Choose whether all Object IDs are assets or collections; one run adds only one kind. Assets is the default
    type: STRING_SELECT
    mandatory: false
    options:
      - name: Assets
        description: |
          Object IDs are assets
        default: true
      - name: Collections
        description: |
          Object IDs are collections, added as sub-collections
    example:
      - name: Object Type
        value: "Assets"
  - name: Iconik URL
    description: |
      Enter the base URL of the Iconik instance, starting with http:// or https://. Leave it empty to use https://app.iconik.io, the default. Trailing slashes are removed
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Iconik URL
        value: "https://app.iconik.io"
outputs:
  - name: Added IDs
    description: |
      Returns the IDs that are now in the collection, in the order entered: those added by this run and those that were already there. Stays empty when the node fails
    type: STRING_LIST
    example:
      - name: Added IDs
        value: '["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"]'
  - name: Added count
    description: |
      Returns the number of IDs in Added IDs. Stays empty when the node fails
    type: NUMBER
    example:
      - name: Added count
        value: 1
  - name: Failed
    description: |
      Returns a JSON list with one entry per object that could not be added: id, and error with Iconik's status and message. An empty list when every object was added. Stays empty when the node fails
    type: JSON
    example:
      - name: Failed
        value: |
          [
            { "id": "11111111-2222-4333-8444-555555555555", "error": "Iconik returned 400: Asset does not exist" }
          ]
  - name: Failed count
    description: |
      Returns the number of entries in Failed. Branch on it to handle partial failures. Stays empty when the node fails
    type: NUMBER
    example:
      - name: Failed count
        value: 0
  - name: Curl
    description: |
      Returns the request for the first object as a curl command, with placeholders in place of the App ID and Auth Token; the requests for the other objects differ only in object_id. It is set before the first request is sent, so it also holds a value when a request fails; it stays empty when an input check fails first
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X POST \
            -H "App-ID: <your-app-id>" \
            -H "Auth-Token: <your-auth-token>" \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -d '{"object_id":"7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b","object_type":"assets"}' \
            -L --max-redirs 5 \
            "https://app.iconik.io/API/assets/v1/collections/5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d/contents/"
connectors:
  - name: Success
    description: |
      Triggered when at least one object is now in the collection, also when other objects failed; check Failed count for those
  - name: Fail
    description: |
      Triggered when an input check fails, no object could be added, the collection is not found, or the credentials are rejected. When an input check fails, nothing is sent to Iconik. Objects added before a stop stay in the collection, and the message says how many. Every error Iconik reports is shown as "Iconik returned <status>: <Iconik's error text>"
    causes:
      - name: Invalid Input
        description: |
          If Collection ID is not a UUID, Object IDs is empty or holds an entry that is not a UUID or not a valid list, or Object Type is not one of its options
      - name: Nothing Added
        description: |
          If every object failed. The message lists the first 5 IDs with Iconik's reason, for example an asset that does not exist, and how many more failed
      - name: Authentication Failed
        description: |
          If the App ID or Auth Token is empty, or Iconik answers 401 or 403
      - name: Not Found
        description: |
          If Iconik answers 404, which it documents for a collection that is not found. The message names the Collection ID
      - name: Connection Error
        description: |
          If the Iconik URL is not a valid http:// or https:// URL, Iconik cannot be reached, or Iconik does not answer within 30 seconds
      - name: Canceled
        description: |
          If the stream is canceled between two objects
---
::
