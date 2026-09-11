# Native and model asset provenance

`model-manifest.json` pins the distributed bytes, sizes, source references and runtime requirements. Runtime JavaScript packages retain their own license files when staged from the lockfile.

- Phone model: the referenced Hugging Face model card declares Apache-2.0. Output is TIMIT ARPABET from an English-trained model, not universal IPA. The original quantization converter version and exact upstream model commit were not recorded. The existing Xenolinguist v1.0.0 distribution and extracted model are pinned by SHA256; this makes those bytes repeatable without asserting that the original conversion can be reproduced. The model-card reference is an observed source revision, not proof of the weights' upstream revision.
- whisper.cpp: Windows CPU binaries from v1.8.6, MIT. The multilingual base-q5_1 model is the existing tracked distribution; its original Hugging Face commit was not recorded. The repository commit and file hashes pin the current bytes.
- eSpeak NG: Windows distribution identified by the original vendoring instructions as 1.51, GPL-3.0-or-later. Compiled dictionaries, voices and phoneme data remain byte-exact. The manifest links the upstream source and license; see the upstream repository for associated source and notices.

Do not substitute newer assets under an existing manifest hash or describe a successful fixture test as evidence of multilingual acoustic accuracy. Replacing these legacy artifacts with a documented conversion/build recipe is a future provenance improvement.
