import asyncio
import websockets
import json

async def test_chat():
    uri = "ws://localhost:8001/chat/stream"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to server.")
            
            # Test 1: Send text
            payload = {
                "type": "text",
                "content": "en sugar normal-aa?"
            }
            print(f"Sending: {payload['content']}")
            await websocket.send(json.dumps(payload))
            
            response_str = await websocket.recv()
            response = json.loads(response_str)
            
            print(f"Server text response: {response.get('text')}")
            audio_data = response.get('audio')
            if audio_data:
                print(f"Server audio response: [Received base64 audio string of length {len(audio_data)}]")
            else:
                print("Server audio response: None")

            # Follow up to test session memory
            payload2 = {
                "type": "text",
                "content": "adhu prachanaya?"
            }
            print(f"\nSending follow-up: {payload2['content']}")
            await websocket.send(json.dumps(payload2))

            response_str2 = await websocket.recv()
            response2 = json.loads(response_str2)

            print(f"Server text response: {response2.get('text')}")
            audio_data2 = response2.get('audio')
            if audio_data2:
                print(f"Server audio response: [Received base64 audio string of length {len(audio_data2)}]")
            else:
                print("Server audio response: None")
            
    except ConnectionRefusedError:
        print("Connection refused. Make sure the server is running on port 8001 (uvicorn main:app --port 8001).")

if __name__ == "__main__":
    asyncio.run(test_chat())
