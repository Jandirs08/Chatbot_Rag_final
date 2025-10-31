"""Password hashing and verification utilities using bcrypt directly."""
import logging
import bcrypt
from typing import Union

# Configure logging
logger = logging.getLogger(__name__)

class PasswordHandler:
    """Password hashing and verification handler using bcrypt directly."""
    
    def __init__(self, rounds: int = 12):
        """
        Initialize password handler.
        
        Args:
            rounds: Number of rounds for bcrypt (default: 12)
        """
        self.rounds = rounds
    
    def hash_password(self, password: str) -> str:
        """
        Hash a password using bcrypt.
        
        Args:
            password: Plain text password to hash
            
        Returns:
            Hashed password string
            
        Raises:
            ValueError: If password is empty or invalid
            RuntimeError: If hashing fails
        """
        if not password or not isinstance(password, str):
            raise ValueError("Password must be a non-empty string")
        
        if len(password.strip()) == 0:
            raise ValueError("Password cannot be empty or whitespace only")
        
        try:
            # Convert password to bytes
            password_bytes = password.encode('utf-8')
            
            # Generate salt and hash
            salt = bcrypt.gensalt(rounds=self.rounds)
            hashed = bcrypt.hashpw(password_bytes, salt)
            
            # Convert back to string
            hashed_str = hashed.decode('utf-8')
            
            logger.debug("Password hashed successfully")
            return hashed_str
        except Exception as e:
            logger.error(f"Password hashing failed: {str(e)}")
            raise RuntimeError(f"Failed to hash password: {str(e)}")
    
    def hash(self, password: str) -> str:
        """Alias for hash_password for backward compatibility."""
        return self.hash_password(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """
        Verify a password against its hash.
        
        Args:
            plain_password: Plain text password to verify
            hashed_password: Hashed password to verify against
            
        Returns:
            True if password matches, False otherwise
            
        Raises:
            ValueError: If inputs are invalid
        """
        if not plain_password or not isinstance(plain_password, str):
            raise ValueError("Plain password must be a non-empty string")
        
        if not hashed_password or not isinstance(hashed_password, str):
            raise ValueError("Hashed password must be a non-empty string")
        
        try:
            # Convert to bytes
            password_bytes = plain_password.encode('utf-8')
            hash_bytes = hashed_password.encode('utf-8')
            
            # Verify password
            is_valid = bcrypt.checkpw(password_bytes, hash_bytes)
            
            logger.debug(f"Password verification result: {is_valid}")
            return is_valid
        except Exception as e:
            logger.error(f"Password verification failed: {str(e)}")
            # Return False for security reasons - don't expose internal errors
            return False
    
    def needs_update(self, hashed_password: str) -> bool:
        """
        Check if a hashed password needs to be updated.
        
        This is useful when upgrading hashing algorithms or parameters.
        
        Args:
            hashed_password: Hashed password to check
            
        Returns:
            True if password needs rehashing, False otherwise
        """
        if not hashed_password or not isinstance(hashed_password, str):
            return True
        
        try:
            # Extract rounds from hash
            if not hashed_password.startswith('$2b$'):
                return True
            
            parts = hashed_password.split('$')
            if len(parts) < 4:
                return True
            
            current_rounds = int(parts[2])
            return current_rounds != self.rounds
        except Exception as e:
            logger.warning(f"Could not check if password needs update: {str(e)}")
            return True  # Err on the side of caution

# Global password handler instance
_password_handler: PasswordHandler = PasswordHandler()

def get_password_handler() -> PasswordHandler:
    """Get the global password handler instance."""
    return _password_handler

# Convenience functions for backward compatibility
def hash_password(password: str) -> str:
    """
    Hash a password.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        Hashed password string
    """
    return _password_handler.hash_password(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its hash.
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: Hashed password to verify against
        
    Returns:
        True if password matches, False otherwise
    """
    return _password_handler.verify_password(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """
    Get password hash (alias for hash_password for compatibility).
    
    Args:
        password: Plain text password to hash
        
    Returns:
        Hashed password string
    """
    return hash_password(password)

def password_needs_update(hashed_password: str) -> bool:
    """
    Check if a hashed password needs to be updated.
    
    Args:
        hashed_password: Hashed password to check
        
    Returns:
        True if password needs rehashing, False otherwise
    """
    return _password_handler.needs_update(hashed_password)