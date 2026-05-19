"""
Abstract base class for data sources.
Each source must implement fetch() and return a list of RawArticle objects.
"""

from dataclasses import dataclass, field
from abc import ABC, abstractmethod


@dataclass
class RawArticle:
    """Normalized article from any data source."""
    title: str = ""
    url: str = ""
    content: str = ""
    date: str = ""
    source_name: str = ""   # e.g. "TechCrunch", "Tavily", "RSS"
    company: str = ""


class DataSource(ABC):
    """Base class for all data sources. Each source is independently replaceable."""

    source_name: str = "unknown"

    @abstractmethod
    def fetch(self, company_name: str, keywords: list[str] = None) -> list[RawArticle]:
        """Fetch articles/content for a given company.

        Args:
            company_name: Name of the company to search for.
            keywords: Optional additional keywords to refine the search.

        Returns:
            List of RawArticle objects with normalized fields.
        """
        ...
