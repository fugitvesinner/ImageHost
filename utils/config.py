
from collections import namedtuple



LoggingConfig = namedtuple("Logging", ["LEVEL", "FORMAT", "DATE_FORMAT"])
Logging = LoggingConfig(
    LEVEL="INFO",  
    FORMAT="{asctime} [{levelname}] {name}: {message}",
    DATE_FORMAT="%Y-%m-%d %H:%M:%S"
)
