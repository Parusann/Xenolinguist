# World Loanword Database reference pilot

This subset is adapted from Lexibank WOLD v4.2, revision 1df62b9bdc7292b35982aea49b4d5bd1951f6f3e. Dataset release: https://doi.org/10.5281/zenodo.21415389. Source repository: https://github.com/lexibank/wold.

License: Creative Commons Attribution 4.0 International (CC BY 4.0). The unmodified license is in LICENSE; https://creativecommons.org/licenses/by/4.0/.

Original publication: Haspelmath, Martin & Tadmor, Uri (eds.) 2009. World Loanword Database. Leipzig: Max Planck Institute for Evolutionary Anthropology. https://wold.clld.org/.

Lexibank conversion credits include Robert Forkel, Johann-Mattis List, Tiago Tresoldi and Natalia Morozova. Original publication editors: Martin Haspelmath and Uri Tadmor. Original vocabulary contributions retain their respective authorship:
- Thilo Schadeberg. 2009. Swahili vocabulary. In: Haspelmath, Martin & Tadmor, Uri (eds.) World Loanword Database. Leipzig: Max Planck Institute for Evolutionary Anthropology, 1625 entries. (Available online at https://wold.clld.org/vocabulary/1)
- Anthony Grant. 2009. English vocabulary. In: Haspelmath, Martin & Tadmor, Uri (eds.) World Loanword Database. Leipzig: Max Planck Institute for Evolutionary Anthropology, 1505 entries. (Available online at https://wold.clld.org/vocabulary/13)
- Michael Rießler. 2009. Kildin Saami vocabulary. In: Haspelmath, Martin & Tadmor, Uri (eds.) World Loanword Database. Leipzig: Max Planck Institute for Evolutionary Anthropology, 1342 entries. (Available online at https://wold.clld.org/vocabulary/14)
- Brigitte Pakendorf and Innokentij Novgorodov. 2009. Sakha vocabulary. In: Haspelmath, Martin & Tadmor, Uri (eds.) World Loanword Database. Leipzig: Max Planck Institute for Evolutionary Anthropology, 1411 entries. (Available online at https://wold.clld.org/vocabulary/19)
- Christopher K. Schmidt. 2009. Japanese vocabulary. In: Haspelmath, Martin & Tadmor, Uri (eds.) World Loanword Database. Leipzig: Max Planck Institute for Evolutionary Anthropology, 1975 entries. (Available online at https://wold.clld.org/vocabulary/21)
- Thekla Wiebusch. 2009. Mandarin Chinese vocabulary. In: Haspelmath, Martin & Tadmor, Uri (eds.) World Loanword Database. Leipzig: Max Planck Institute for Evolutionary Anthropology, 2049 entries. (Available online at https://wold.clld.org/vocabulary/22)
Changes: select six languages and eleven concept IDs; retain all 70 form rows in those cells, including synonyms and source columns; serialize CSV with LF. Forms and borrowing annotations have not been reinterpreted. sources.bib is the complete upstream bibliography so source references remain available.

This fixture is for reference ingestion only. It is not included in model training or synthetic decipherment scoring. It does not imply that these known languages are unknown to pretrained models or that linguistic ancestry can be inferred from word resemblance. Source-lock and manifest hashes allow the subset to be regenerated and checked.
