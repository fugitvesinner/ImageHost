import logging
import sys
from utils.config import Logging

class ColoredFormatter(logging.Formatter):
    """Custom formatter with colors for different log levels."""
    
    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
    }
    RESET = '\033[0m'
    
    def format(self, record):
        original_levelname = record.levelname
        if original_levelname in self.COLORS:
            record.levelname = f"{self.COLORS[original_levelname]}{original_levelname}{self.RESET}"
        formatted = super().format(record)
        record.levelname = original_levelname 
        return formatted

def setup_logger():
    """Setup the logger with the configuration from utils.config."""
    logger = logging.getLogger()
    logger.setLevel(getattr(logging, Logging.LEVEL.upper(), logging.INFO))

    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, Logging.LEVEL.upper(), logging.INFO))
    
    formatter = ColoredFormatter(
        fmt=Logging.FORMAT,
        datefmt=Logging.DATE_FORMAT,
        style='{'
    )
    handler.setFormatter(formatter)

    logger.addHandler(handler)
    return logger

log = setup_logger()
