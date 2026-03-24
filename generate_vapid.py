from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.backends import default_backend
import base64

private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
public_key = private_key.public_key()

def to_base64_url(b):
    return base64.urlsafe_b64encode(b).decode('utf-8').rstrip('=')

from cryptography.hazmat.primitives import serialization

private_numbers = private_key.private_numbers()
priv_bytes = private_numbers.private_value.to_bytes(32, 'big')
pub_bytes = public_key.public_bytes(
    encoding=serialization.Encoding.X962,
    format=serialization.PublicFormat.UncompressedPoint
)

private_b64 = to_base64_url(priv_bytes)
public_b64 = to_base64_url(pub_bytes)

with open('.env', 'w') as f:
    f.write(f"VAPID_PRIVATE_KEY={private_b64}\n")
    f.write(f"VAPID_PUBLIC_KEY={public_b64}\n")

print("Generated VAPID Keys in .env!")
print(f"Public Key: {public_b64}")
