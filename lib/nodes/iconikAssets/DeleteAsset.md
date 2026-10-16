::wavedoc
---
title: Delete Asset
description: |
  The Delete Asset node moves one or more assets to the Iconik delete queue, where Iconik marks them as deleted. It never purges: the assets stay in the delete queue and can be restored in Iconik. The node sends the IDs in requests of at most 100 IDs each, one after the other, and ends on Success when Iconik has accepted every request. If a later request fails, the assets of the earlier requests are already in the delete queue; the error message says how many. Iconik answers these requests without a body, so there is no response object to output. The node authenticates with an Iconik App ID and Auth Token; wire both from Get Secret nodes. Iconik requires the can_delete_assets role for this request. When Iconik rate-limits a request (429), the node tries it again, up to 3 attempts in total.
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
  - name: Asset IDs
    description: |
      Enter the IDs of the assets to delete, one per entry. An entry may also be a wildcard to another node's list output, such as the asset IDs from Search, or several IDs separated by commas, semicolons or new lines. Every ID must be a UUID; duplicates are sent once. An empty list, or any ID that is not a UUID, fails the node before a request is sent
    type: STRING_LIST
    mandatory: true
    example:
      - name: Asset IDs
        value: '["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"]'
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
  - name: Deleted IDs
    description: |
      Returns the IDs that Iconik accepted for the delete queue, in the order entered and without duplicates. Iconik does not report back per ID, so this is the list that was sent. Stays empty when the node fails
    type: STRING_LIST
    example:
      - name: Deleted IDs
        value: '["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"]'
  - name: Deleted count
    description: |
      Returns the number of IDs in Deleted IDs. Stays empty when the node fails
    type: NUMBER
    example:
      - name: Deleted count
        value: 1
  - name: Curl
    description: |
      Returns one curl command per request, separated by a blank line, with placeholders in place of the App ID and Auth Token. It is set before the first request is sent, so it also holds a value when Iconik rejects a request; it stays empty when an input check fails first
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X POST \
            -H "App-ID: <your-app-id>" \
            -H "Auth-Token: <your-auth-token>" \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -d '{"ids":["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"]}' \
            -L --max-redirs 5 \
            "https://app.iconik.io/API/assets/v1/delete_queue/assets/"
connectors:
  - name: Success
    description: |
      Triggered when Iconik has accepted every request with a 2xx status, including after a rate-limited attempt was retried
  - name: Fail
    description: |
      Triggered when an input check fails or Iconik rejects a request. When an input check fails, nothing is sent to Iconik. When a later request fails, the assets of the earlier requests stay in the delete queue and the message says how many. Every error Iconik reports is shown as "Iconik returned <status>: <Iconik's error text>"
    causes:
      - name: Invalid Input
        description: |
          If Asset IDs is empty, an entry is not text or not a valid list, or an ID is not a UUID
      - name: Request Rejected
        description: |
          If Iconik answers 400. The message shows Iconik's reason unchanged
      - name: Authentication Failed
        description: |
          If the App ID or Auth Token is empty, or Iconik answers 401 or 403
      - name: Rate Limited
        description: |
          If Iconik still answers 429 on the third attempt of a request. Between attempts the node waits as long as Iconik's Retry-After header says, at most 60 seconds, or 1 second and then 2 seconds when the header is missing
      - name: Connection Error
        description: |
          If the Iconik URL is not a valid http:// or https:// URL, Iconik cannot be reached, or Iconik does not answer within 30 seconds
      - name: Canceled
        description: |
          If the stream is canceled between two requests or while the node waits to retry a rate-limited request
      - name: API Error
        description: |
          If Iconik answers with any other non-2xx status
---
::
