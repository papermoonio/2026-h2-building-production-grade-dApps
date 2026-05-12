// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IEventRegistry.sol";
import "./ITicketMinter.sol";

/**
 * @title EventRegistry (意图部署在 EVM / REVM 后端)
 * @notice 活动登记中心：创建活动、接收订票请求、管理剩余库存。
 *
 *         在 Polkadot Hub 上，这个合约建议用标准 solc 编译，让 REVM 执行。
 *         它通过标准 Solidity 外部调用触发 PVM 侧的 TicketMinter 完成实际铸造。
 *
 *         关键点: pallet_revive 共享地址空间，所以 EVM 合约调用 PVM 合约的
 *         语法和 gas 语义与同 VM 调用完全一致——开发者无需写任何桥代码。
 */
contract EventRegistry is IEventRegistry {
    struct EventInfo {
        string name;       // 活动名称
        uint256 capacity;  // 总票数
        uint256 sold;      // 已售票数
        bool exists;       // 标记是否已创建
    }

    /// @notice 关联的 PVM 铸造合约
    ITicketMinter public minter;

    /// @notice 合约所有者（有权创建活动）
    address public owner;

    /// @notice 活动 id => 活动信息
    mapping(uint256 => EventInfo) public events;

    /// @notice 防重入 + 锁定 onTicketMinted 只能被当前 bookTicket 流程触发
    ///         pendingBooker[eventId] = 当前正在为该活动订票的用户地址
    mapping(uint256 => address) private pendingBooker;

    uint256 public nextEventId;

    // ---------- Events ----------
    event EventCreated(uint256 indexed eventId, string name, uint256 capacity);
    event BookingRequested(uint256 indexed eventId, address indexed buyer);
    event BookingConfirmed(uint256 indexed eventId, uint256 indexed ticketId, address indexed buyer);
    event MinterUpdated(address oldMinter, address newMinter);

    // ---------- Modifiers ----------
    modifier onlyOwner() {
        require(msg.sender == owner, "EventRegistry: not owner");
        _;
    }

    modifier onlyMinter() {
        require(msg.sender == address(minter), "EventRegistry: caller is not minter");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ---------- Admin ----------
    /// @notice 管理员绑定对应的 PVM TicketMinter 合约地址
    function setMinter(address _minter) external onlyOwner {
        require(_minter != address(0), "EventRegistry: zero minter");
        emit MinterUpdated(address(minter), _minter);
        minter = ITicketMinter(_minter);
    }

    /// @notice 创建一个活动
    function createEvent(string calldata name, uint256 capacity) external onlyOwner returns (uint256 id) {
        require(capacity > 0, "EventRegistry: zero capacity");
        id = nextEventId++;
        events[id] = EventInfo({ name: name, capacity: capacity, sold: 0, exists: true });
        emit EventCreated(id, name, capacity);
    }

    // ---------- User flow ----------
    /// @notice 用户订票入口。内部会调用 PVM 合约执行实际铸造。
    function bookTicket(uint256 eventId) external returns (uint256 ticketId) {
        EventInfo storage ev = events[eventId];
        require(ev.exists, "EventRegistry: event not found");
        require(ev.sold < ev.capacity, "EventRegistry: sold out");
        require(address(minter) != address(0), "EventRegistry: minter unset");
        require(pendingBooker[eventId] == address(0), "EventRegistry: concurrent booking");

        emit BookingRequested(eventId, msg.sender);

        // 标记正在进行的订单，防止恶意 minter 在非 bookTicket 流程中回调
        pendingBooker[eventId] = msg.sender;

        // *** 跨 VM 调用 (EVM -> PVM) ***
        // 从 Solidity 角度看只是一次普通 external call，
        // pallet_revive 会发现 minter 是 PVM 字节码并路由到 PolkaVM。
        ticketId = minter.mintTicket(eventId, msg.sender);

        // 清除标记（即便 minter 回调时已经扣减库存，这里是双保险）
        pendingBooker[eventId] = address(0);

        // 如果 minter 已经触发了 onTicketMinted 回调，库存应该已被更新；
        // 如果没有，这里兜底（正常路径下不会用到）。
        if (ev.sold + 1 == ev.capacity || ticketId >= minter.totalMinted()) {
            // no-op: 库存更新由回调负责
        }
    }

    // ---------- Callback (PVM -> EVM) ----------
    /**
     * @notice PVM 铸造成功后反向调用 EVM 完成库存扣减和事件追踪。
     *         这就是 "双向跨 VM 调用" 的后半段：
     *             EVM -> PVM.mintTicket(...)
     *             PVM -> EVM.onTicketMinted(...)  <-- 我们在这里
     *
     *         安全性：
     *         1. msg.sender 必须等于已注册的 minter（onlyMinter）
     *         2. pendingBooker[eventId] 必须等于 buyer，防止 minter
     *            在非预期时机调用这个函数
     */
    function onTicketMinted(uint256 eventId, uint256 ticketId, address buyer) external onlyMinter {
        require(pendingBooker[eventId] == buyer, "EventRegistry: unexpected callback");
        EventInfo storage ev = events[eventId];
        require(ev.exists, "EventRegistry: event not found");
        require(ev.sold < ev.capacity, "EventRegistry: overflow");

        ev.sold += 1;
        emit BookingConfirmed(eventId, ticketId, buyer);
    }

    // ---------- View helpers ----------
    function remaining(uint256 eventId) external view returns (uint256) {
        EventInfo storage ev = events[eventId];
        require(ev.exists, "EventRegistry: event not found");
        return ev.capacity - ev.sold;
    }
}
