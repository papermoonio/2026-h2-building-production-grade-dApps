// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IEventRegistry.sol";

/**
 * @title TicketMinter (意图部署在 PVM / PolkaVM 后端)
 * @notice 票务铸造器：持有全局 ticketId 计数器，为每张票记录 owner 和所属 event。
 *
 *         在 Polkadot Hub 上，这个合约建议用 resolc (revive) 编译成 PolkaVM 字节码。
 *         它实现 `ITicketMinter` 接口，所以 EVM 侧的 EventRegistry 可以像调用
 *         普通 Solidity 合约一样触发它。
 *
 *         铸造完一张票后，它会 **反向调用** EVM 侧的 registry.onTicketMinted()，
 *         演示 PVM -> EVM 方向的跨后端调用。
 */
contract TicketMinter {
    struct Ticket {
        uint256 eventId;
        address owner;
    }

    /// @notice 关联的 EVM EventRegistry
    IEventRegistry public registry;

    /// @notice 合约所有者（设置 registry）
    address public owner;

    /// @notice 全局票号计数（单调递增）
    uint256 public totalMinted;

    /// @notice ticketId => Ticket
    mapping(uint256 => Ticket) public tickets;

    // ---------- Events ----------
    event TicketMinted(uint256 indexed ticketId, uint256 indexed eventId, address indexed owner);
    event RegistryUpdated(address oldRegistry, address newRegistry);

    modifier onlyOwner() {
        require(msg.sender == owner, "TicketMinter: not owner");
        _;
    }

    modifier onlyRegistry() {
        require(msg.sender == address(registry), "TicketMinter: caller is not registry");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice 绑定 EVM 侧的 registry（部署后一次性设置）
    function setRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "TicketMinter: zero registry");
        emit RegistryUpdated(address(registry), _registry);
        registry = IEventRegistry(_registry);
    }

    /**
     * @notice 铸造一张票，仅 registry 可调用。
     *
     *         调用链:
     *         用户 -> EVM.EventRegistry.bookTicket
     *             -> PVM.TicketMinter.mintTicket           (当前函数，跨 VM)
     *                 -> EVM.EventRegistry.onTicketMinted  (反向回调，跨 VM)
     */
    function mintTicket(uint256 eventId, address buyer) external onlyRegistry returns (uint256 ticketId) {
        require(buyer != address(0), "TicketMinter: zero buyer");

        ticketId = ++totalMinted; // 从 1 开始编号
        tickets[ticketId] = Ticket({ eventId: eventId, owner: buyer });
        emit TicketMinted(ticketId, eventId, buyer);

        // *** 反向跨 VM 调用 (PVM -> EVM) ***
        // 调用 EVM 侧的 registry 扣减库存 / 发 confirmation 事件。
        registry.onTicketMinted(eventId, ticketId, buyer);
    }

    // ---------- View helpers ----------
    function ownerOfTicket(uint256 ticketId) external view returns (address) {
        return tickets[ticketId].owner;
    }

    function eventOfTicket(uint256 ticketId) external view returns (uint256) {
        return tickets[ticketId].eventId;
    }
}
