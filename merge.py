import json
from datetime import datetime

noisy_path = r"c:\Users\drnir\OneDrive\Desktop\Abhijot's things\coding\Tech-startupideas\Ishaare-android-app\public\training\noisy-final.json"
default_path = r"c:\Users\drnir\OneDrive\Desktop\Abhijot's things\coding\Tech-startupideas\Ishaare-android-app\public\training\default-training.json"
output_path = r"c:\Users\drnir\OneDrive\Desktop\Abhijot's things\coding\Tech-startupideas\Ishaare-android-app\public\training\default-training.json"

with open(noisy_path, 'r') as f:
    noisy = json.load(f)

with open(default_path, 'r') as f:
    default = json.load(f)

noisy_signs = noisy['signs']
default_signs = default['signs']

print(f"Noisy file signs: {len(noisy_signs)}")
print(f"Default file signs (before merge): {len(default_signs)}")

# Build a set of existing feature tuples for fast lookup
existing_features = set(tuple(s['features']) for s in default_signs)

unique_from_noisy = []
duplicate_count = 0

for s in noisy_signs:
    ft = tuple(s['features'])
    if ft not in existing_features:
        unique_from_noisy.append(s)
        existing_features.add(ft)  # prevent adding dupes from the noisy file itself
    else:
        duplicate_count += 1

print(f"\nDuplicates (already in default): {duplicate_count}")
print(f"Unique new entries to add: {len(unique_from_noisy)}")

# Breakdown of what will be added per label
new_labels = {}
for s in unique_from_noisy:
    new_labels[s['label']] = new_labels.get(s['label'], 0) + 1
print("\nNew entries by label:")
for label, count in sorted(new_labels.items()):
    print(f"  {label}: +{count}")

# Merge
merged_signs = default_signs + unique_from_noisy
print(f"\nFinal merged count: {len(merged_signs)}")

merged = {
    "version": default.get("version", 1),
    "exportedAt": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    "count": len(merged_signs),
    "signs": merged_signs
}

with open(output_path, 'w') as f:
    json.dump(merged, f, indent=2)

print(f"\nSaved to: {output_path}")
